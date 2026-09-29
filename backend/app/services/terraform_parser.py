"""
CostGuard Terraform Plan Parser
Parses Terraform / OpenTofu JSON plans and extracts billable resources, actions, SKUs, and tags.
"""
import json
import re
from typing import Dict, Any, List, Optional, Tuple
from backend.app.schemas.plan import ParsedResourceChange, ResourceTagInfo

# Known non-billable Azure infrastructure resources that should be skipped gracefully
NON_BILLABLE_TYPES = {
    "azurerm_resource_group",
    "azurerm_virtual_network",
    "azurerm_subnet",
    "azurerm_network_security_group",
    "azurerm_network_security_rule",
    "azurerm_route_table",
    "azurerm_route",
    "azurerm_subnet_route_table_association",
    "azurerm_subnet_network_security_group_association",
    "azurerm_network_interface",
    "azurerm_private_dns_zone",
    "azurerm_private_dns_zone_virtual_network_link",
    "azurerm_log_analytics_workspace",
    "azurerm_monitor_diagnostic_setting",
    "azurerm_role_assignment",
    "azurerm_user_assigned_identity",
    "azurerm_key_vault_access_policy",
    "azurerm_public_ip_prefix",
}

# Supported billable resource types for Azure
BILLABLE_TYPES = {
    "azurerm_linux_virtual_machine",
    "azurerm_windows_virtual_machine",
    "azurerm_virtual_machine",
    "azurerm_managed_disk",
    "azurerm_mssql_database",
    "azurerm_app_service_plan",
    "azurerm_service_plan",
}


def normalize_region(region_raw: Optional[str]) -> str:
    """
    Normalizes Azure regions:
    'East US' -> 'eastus'
    'East US 2' -> 'eastus2'
    'West Europe' -> 'westeurope'
    'North Europe' -> 'northeurope'
    """
    if not region_raw:
        return "eastus"
    # lowercase, strip, remove spaces and hyphens
    cleaned = re.sub(r"[\s\-_]+", "", region_raw.strip().lower())
    return cleaned


def extract_sku(resource_type: str, data: Optional[Dict[str, Any]]) -> Optional[str]:
    """Extracts the SKU / size from resource attributes."""
    if not data or not isinstance(data, dict):
        return None

    if resource_type in (
        "azurerm_linux_virtual_machine",
        "azurerm_windows_virtual_machine",
        "azurerm_virtual_machine",
    ):
        return data.get("size") or data.get("vm_size") or data.get("sku")

    if resource_type == "azurerm_managed_disk":
        # Check storage_account_type or sku
        storage_type = data.get("storage_account_type") or data.get("sku")
        disk_size_gb = data.get("disk_size_gb", 128)
        if storage_type:
            return f"{storage_type}_{disk_size_gb}GB" if "GB" not in str(storage_type) else storage_type
        return "Standard_LRS_128GB"

    if resource_type in ("azurerm_app_service_plan", "azurerm_service_plan"):
        sku_name = data.get("sku_name")
        if not sku_name and isinstance(data.get("sku"), dict):
            sku_name = data["sku"].get("size") or data["sku"].get("name")
        return sku_name or "P1v2"

    return data.get("sku") or data.get("size") or data.get("tier")


def extract_region(data: Optional[Dict[str, Any]]) -> Optional[str]:
    """Extracts and normalizes the region."""
    if not data or not isinstance(data, dict):
        return None
    loc = data.get("location")
    return normalize_region(loc) if loc else None


def extract_tags(data: Optional[Dict[str, Any]]) -> ResourceTagInfo:
    """Extracts environment, team, application, and owner tags."""
    if not data or not isinstance(data, dict):
        return ResourceTagInfo()

    tags = data.get("tags") or {}
    if not isinstance(tags, dict):
        return ResourceTagInfo()

    # Case-insensitive lookup for common FinOps tag keys
    lower_map = {k.lower(): v for k, v in tags.items()}

    env = lower_map.get("environment") or lower_map.get("env") or "Not tagged"
    team = lower_map.get("team") or lower_map.get("dept") or lower_map.get("cost_center") or "Not tagged"
    app = lower_map.get("application") or lower_map.get("app") or lower_map.get("service") or "Not tagged"
    owner = lower_map.get("owner") or lower_map.get("contact") or "Not tagged"

    return ResourceTagInfo(
        environment=str(env),
        team=str(team),
        application=str(app),
        owner=str(owner),
        raw_tags={str(k): str(v) for k, v in tags.items()},
    )


def determine_action_type(actions: List[str]) -> str:
    """
    Classifies Terraform change action:
    ["create"] -> "create"
    ["delete"] -> "delete"
    ["update"] -> "update"
    ["delete", "create"] or ["create", "delete"] -> "replacement"
    ["no-op"] -> "no-op"
    """
    actions_set = set(actions)
    if "create" in actions_set and "delete" in actions_set:
        return "replacement"
    if "create" in actions_set:
        return "create"
    if "delete" in actions_set:
        return "delete"
    if "update" in actions_set:
        return "update"
    return "no-op"


def parse_terraform_plan(plan_data: Any) -> Tuple[List[ParsedResourceChange], List[str]]:
    """
    Parses a Terraform plan dict or string and returns:
    (parsed_changes, log_messages)
    """
    logs: List[str] = []

    if isinstance(plan_data, str):
        try:
            plan_dict = json.loads(plan_data)
        except Exception as e:
            raise ValueError(f"Invalid JSON format in Terraform plan: {str(e)}")
    elif isinstance(plan_dict := plan_data, dict):
        pass
    else:
        raise ValueError("Terraform plan must be a JSON string or dictionary object.")

    if not isinstance(plan_dict, dict):
        raise ValueError("Plan JSON root must be an object.")

    resource_changes = plan_dict.get("resource_changes")
    if resource_changes is None:
        raise ValueError("Plan is missing mandatory 'resource_changes' array.")

    if not isinstance(resource_changes, list):
        raise ValueError("'resource_changes' must be an array.")

    parsed: List[ParsedResourceChange] = []

    for rc in resource_changes:
        if not isinstance(rc, dict):
            continue

        address = rc.get("address", "unknown.resource")
        res_type = rc.get("type", "unknown_type")
        change = rc.get("change") or {}
        actions = change.get("actions") or []

        # Determine action
        action_type = determine_action_type(actions)
        if action_type == "no-op":
            continue

        before = change.get("before") or {}
        after = change.get("after") or {}

        # Check non-billable
        if res_type in NON_BILLABLE_TYPES:
            logs.append(f"[INFO] Skipping non-billable resource: {address}")
            parsed.append(
                ParsedResourceChange(
                    address=address,
                    resource_type=res_type,
                    actions=actions,
                    action_type=action_type,
                    is_billable=False,
                    skip_reason="Non-billable infrastructure resource",
                    before_sku=None,
                    after_sku=None,
                    before_region=extract_region(before),
                    after_region=extract_region(after),
                    tags=extract_tags(after if after else before),
                    raw_before=before,
                    raw_after=after,
                )
            )
            continue

        # Extract SKUs
        before_sku = extract_sku(res_type, before)
        after_sku = extract_sku(res_type, after)

        # Extract regions
        before_region = extract_region(before)
        after_region = extract_region(after)

        # Region fallback
        primary_region = after_region or before_region or "eastus"
        before_region = before_region or primary_region
        after_region = after_region or primary_region

        tags = extract_tags(after if after else before)

        parsed.append(
            ParsedResourceChange(
                address=address,
                resource_type=res_type,
                actions=actions,
                action_type=action_type,
                is_billable=True,
                before_sku=before_sku,
                after_sku=after_sku,
                before_region=before_region,
                after_region=after_region,
                tags=tags,
                raw_before=before,
                raw_after=after,
            )
        )

    return parsed, logs

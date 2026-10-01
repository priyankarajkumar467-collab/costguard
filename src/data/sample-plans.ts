import { SamplePlanItem } from "../types";

export const SAMPLE_PLANS_LIST: SamplePlanItem[] = [
  {
    "filename": "plan_create.json",
    "title": "CREATE",
    "description": "Plan A: Create VM Standard_D2s_v3 & Managed Disk"
  },
  {
    "filename": "plan_delete.json",
    "title": "DELETE",
    "description": "Plan B: Delete legacy VM Standard_B1s"
  },
  {
    "filename": "plan_malformed.json",
    "title": "MALFORMED",
    "description": "Plan X: Malformed plan syntax (exit code 2)"
  },
  {
    "filename": "plan_metadata_change.json",
    "title": "METADATA CHANGE",
    "description": "Plan M: Tag change only (₹0 delta)"
  },
  {
    "filename": "plan_noise.json",
    "title": "NOISE",
    "description": "Plan C: 15 Non-billable resources (vnet, subnet, nsg)"
  },
  {
    "filename": "plan_replacement.json",
    "title": "REPLACEMENT",
    "description": "Plan D: VM Replacement (delete, create)"
  },
  {
    "filename": "plan_unknown_sku.json",
    "title": "UNKNOWN SKU",
    "description": "Plan U: Unknown/Custom SKU resilience test"
  },
  {
    "filename": "plan_update.json",
    "title": "UPDATE",
    "description": "Plan B2: Upgrade VM Standard_B2s to Standard_D4s_v3"
  }
];

export const SAMPLE_PLANS_CONTENT: Record<string, any> = {
  "plan_create.json": {
    "format_version": "1.2",
    "terraform_version": "1.7.0",
    "resource_changes": [
      {
        "address": "azurerm_linux_virtual_machine.web_server",
        "module_address": "",
        "mode": "managed",
        "type": "azurerm_linux_virtual_machine",
        "name": "web_server",
        "provider_name": "registry.terraform.io/hashicorp/azurerm",
        "change": {
          "actions": [
            "create"
          ],
          "before": null,
          "after": {
            "location": "eastus",
            "name": "vm-prod-web-01",
            "size": "Standard_D2s_v3",
            "tags": {
              "Environment": "Production",
              "Team": "Frontend",
              "Application": "Storefront",
              "Owner": "alex@company.internal"
            }
          }
        }
      },
      {
        "address": "azurerm_managed_disk.data_disk",
        "module_address": "",
        "mode": "managed",
        "type": "azurerm_managed_disk",
        "name": "data_disk",
        "provider_name": "registry.terraform.io/hashicorp/azurerm",
        "change": {
          "actions": [
            "create"
          ],
          "before": null,
          "after": {
            "location": "eastus",
            "name": "disk-prod-web-data",
            "sku": "Premium_LRS",
            "storage_account_type": "Premium_LRS",
            "disk_size_gb": 128,
            "tags": {
              "Environment": "Production",
              "Team": "Frontend",
              "Application": "Storefront",
              "Owner": "alex@company.internal"
            }
          }
        }
      },
      {
        "address": "azurerm_resource_group.rg_main",
        "module_address": "",
        "mode": "managed",
        "type": "azurerm_resource_group",
        "name": "rg_main",
        "provider_name": "registry.terraform.io/hashicorp/azurerm",
        "change": {
          "actions": [
            "create"
          ],
          "before": null,
          "after": {
            "location": "eastus",
            "name": "rg-costguard-prod"
          }
        }
      }
    ]
  },
  "plan_delete.json": {
    "format_version": "1.2",
    "terraform_version": "1.7.0",
    "resource_changes": [
      {
        "address": "azurerm_linux_virtual_machine.legacy_worker",
        "mode": "managed",
        "type": "azurerm_linux_virtual_machine",
        "name": "legacy_worker",
        "provider_name": "registry.terraform.io/hashicorp/azurerm",
        "change": {
          "actions": [
            "delete"
          ],
          "before": {
            "location": "eastus",
            "name": "vm-legacy-worker",
            "size": "Standard_B1s",
            "tags": {
              "Environment": "Staging",
              "Team": "Backend",
              "Application": "BatchProcessor"
            }
          },
          "after": null
        }
      }
    ]
  },
  "plan_malformed.json": "{\n  \"invalid_terraform\": true,\n  \"missing_resource_changes\": \"broken_payload\"\n",
  "plan_metadata_change.json": {
    "format_version": "1.2",
    "terraform_version": "1.7.0",
    "resource_changes": [
      {
        "address": "azurerm_linux_virtual_machine.existing_vm",
        "type": "azurerm_linux_virtual_machine",
        "change": {
          "actions": [
            "update"
          ],
          "before": {
            "location": "eastus",
            "size": "Standard_B2s",
            "tags": {
              "CostCenter": "1001"
            }
          },
          "after": {
            "location": "eastus",
            "size": "Standard_B2s",
            "tags": {
              "CostCenter": "1002",
              "Environment": "Production"
            }
          }
        }
      }
    ]
  },
  "plan_noise.json": {
    "format_version": "1.2",
    "terraform_version": "1.7.0",
    "resource_changes": [
      {
        "address": "azurerm_resource_group.rg_network",
        "type": "azurerm_resource_group",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "rg-network",
            "location": "eastus"
          }
        }
      },
      {
        "address": "azurerm_virtual_network.vnet_hub",
        "type": "azurerm_virtual_network",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "vnet-hub",
            "location": "eastus"
          }
        }
      },
      {
        "address": "azurerm_subnet.snet_gateway",
        "type": "azurerm_subnet",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "GatewaySubnet"
          }
        }
      },
      {
        "address": "azurerm_subnet.snet_apps",
        "type": "azurerm_subnet",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "snet-apps"
          }
        }
      },
      {
        "address": "azurerm_network_security_group.nsg_web",
        "type": "azurerm_network_security_group",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "nsg-web",
            "location": "eastus"
          }
        }
      },
      {
        "address": "azurerm_network_security_rule.allow_https",
        "type": "azurerm_network_security_rule",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "allow-https"
          }
        }
      },
      {
        "address": "azurerm_network_security_rule.allow_ssh",
        "type": "azurerm_network_security_rule",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "allow-ssh"
          }
        }
      },
      {
        "address": "azurerm_route_table.rt_main",
        "type": "azurerm_route_table",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "rt-main",
            "location": "eastus"
          }
        }
      },
      {
        "address": "azurerm_route.route_internet",
        "type": "azurerm_route",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "default-internet"
          }
        }
      },
      {
        "address": "azurerm_subnet_route_table_association.assoc_apps",
        "type": "azurerm_subnet_route_table_association",
        "change": {
          "actions": [
            "create"
          ],
          "after": {}
        }
      },
      {
        "address": "azurerm_subnet_network_security_group_association.assoc_nsg",
        "type": "azurerm_subnet_network_security_group_association",
        "change": {
          "actions": [
            "create"
          ],
          "after": {}
        }
      },
      {
        "address": "azurerm_network_interface.nic_dummy",
        "type": "azurerm_network_interface",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "nic-dummy",
            "location": "eastus"
          }
        }
      },
      {
        "address": "azurerm_private_dns_zone.dns_internal",
        "type": "azurerm_private_dns_zone",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "internal.corp"
          }
        }
      },
      {
        "address": "azurerm_private_dns_zone_virtual_network_link.link_hub",
        "type": "azurerm_private_dns_zone_virtual_network_link",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "link-hub"
          }
        }
      },
      {
        "address": "azurerm_log_analytics_workspace.law_dummy",
        "type": "azurerm_log_analytics_workspace",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "name": "law-central",
            "location": "eastus"
          }
        }
      }
    ]
  },
  "plan_replacement.json": {
    "format_version": "1.2",
    "terraform_version": "1.7.0",
    "resource_changes": [
      {
        "address": "azurerm_windows_virtual_machine.reporting_host",
        "mode": "managed",
        "type": "azurerm_windows_virtual_machine",
        "name": "reporting_host",
        "provider_name": "registry.terraform.io/hashicorp/azurerm",
        "change": {
          "actions": [
            "delete",
            "create"
          ],
          "before": {
            "location": "westeurope",
            "name": "vm-win-report-old",
            "size": "Standard_D2s_v3",
            "tags": {
              "Environment": "Analytics",
              "Team": "BI",
              "Application": "FinancialReporting"
            }
          },
          "after": {
            "location": "westeurope",
            "name": "vm-win-report-new",
            "size": "Standard_D4s_v3",
            "tags": {
              "Environment": "Analytics",
              "Team": "BI",
              "Application": "FinancialReporting"
            }
          }
        }
      }
    ]
  },
  "plan_unknown_sku.json": {
    "format_version": "1.2",
    "terraform_version": "1.7.0",
    "resource_changes": [
      {
        "address": "azurerm_linux_virtual_machine.experimental",
        "type": "azurerm_linux_virtual_machine",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "location": "eastus",
            "size": "Custom_Unknown_SKU_Quantum_9999",
            "tags": {
              "Team": "Research"
            }
          }
        }
      },
      {
        "address": "azurerm_linux_virtual_machine.standard_worker",
        "type": "azurerm_linux_virtual_machine",
        "change": {
          "actions": [
            "create"
          ],
          "after": {
            "location": "eastus",
            "size": "Standard_B1s",
            "tags": {
              "Team": "Research"
            }
          }
        }
      }
    ]
  },
  "plan_update.json": {
    "format_version": "1.2",
    "terraform_version": "1.7.0",
    "resource_changes": [
      {
        "address": "azurerm_linux_virtual_machine.api_cluster",
        "mode": "managed",
        "type": "azurerm_linux_virtual_machine",
        "name": "api_cluster",
        "provider_name": "registry.terraform.io/hashicorp/azurerm",
        "change": {
          "actions": [
            "update"
          ],
          "before": {
            "location": "East US",
            "name": "vm-prod-api-01",
            "size": "Standard_B2s",
            "tags": {
              "Environment": "Production",
              "Team": "CoreAPI",
              "Application": "Payments"
            }
          },
          "after": {
            "location": "East US",
            "name": "vm-prod-api-01",
            "size": "Standard_D4s_v3",
            "tags": {
              "Environment": "Production",
              "Team": "CoreAPI",
              "Application": "Payments"
            }
          }
        }
      }
    ]
  }
};

"""
CostGuard Plan Schemas
"""
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field


@dataclass
class ResourceTagInfo:
    environment: str = "Not tagged"
    team: str = "Not tagged"
    application: str = "Not tagged"
    owner: str = "Not tagged"
    raw_tags: Dict[str, str] = field(default_factory=dict)


@dataclass
class ParsedResourceChange:
    address: str
    resource_type: str
    actions: List[str]
    action_type: str  # "create" | "delete" | "update" | "replacement" | "no-op"
    is_billable: bool
    skip_reason: Optional[str] = None
    before_sku: Optional[str] = None
    after_sku: Optional[str] = None
    before_region: Optional[str] = None
    after_region: Optional[str] = None
    tags: ResourceTagInfo = field(default_factory=ResourceTagInfo)
    raw_before: Optional[Dict[str, Any]] = None
    raw_after: Optional[Dict[str, Any]] = None

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class HubStatus(str, Enum):
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"


class VehicleType(str, Enum):
    TRUCK = "TRUCK"
    VAN = "VAN"
    RAIL = "RAIL"
    AIR = "AIR"


class VehicleStatus(str, Enum):
    IN_TRANSIT = "IN_TRANSIT"
    AT_HUB = "AT_HUB"
    COMPLETED = "COMPLETED"


class ShipmentStatus(str, Enum):
    IN_TRANSIT = "IN_TRANSIT"
    MISPLACED = "MISPLACED"
    RECOVERING = "RECOVERING"
    RECOVERED = "RECOVERED"
    DELIVERED = "DELIVERED"
    DISRUPTED = "DISRUPTED"


class AssignmentStatus(str, Enum):
    PENDING = "PENDING"
    IN_TRANSIT = "IN_TRANSIT"
    COMPLETED = "COMPLETED"
    MISSED = "MISSED"
    CANCELLED = "CANCELLED"


class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class PiggybackMode(str, Enum):
    DIRECT = "DIRECT"
    CONSOLIDATION = "CONSOLIDATION"
    MULTI_HOP = "MULTI_HOP"
    REPOSITIONING = "REPOSITIONING"


class RecoveryEventStatus(str, Enum):
    DETECTED = "DETECTED"
    CANDIDATES_FOUND = "CANDIDATES_FOUND"
    RECOVERY_CHOSEN = "RECOVERY_CHOSEN"
    RECOVERING = "RECOVERING"
    RECOVERED = "RECOVERED"
    FAILED = "FAILED"


class GeoPoint(BaseModel):
    lat: float
    lng: float


class Hub(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    status: HubStatus = HubStatus.ACTIVE
    transfer_time_hours: float = 2.0
    handling_cost_per_kg: float = 0.5


class RouteLeg(BaseModel):
    from_hub_id: str
    to_hub_id: str
    distance_km: float


class Route(BaseModel):
    id: str
    hub_sequence: list[str]
    legs: list[RouteLeg]


class Vehicle(BaseModel):
    id: str
    type: VehicleType
    route_hub_sequence: list[str]
    current_position: GeoPoint
    current_leg_index: int = 0
    progress_on_leg_km: float = 0.0
    total_capacity_kg: float
    used_capacity_kg: float = 0.0
    cost_per_km: float
    speed_kmh: float
    status: VehicleStatus = VehicleStatus.IN_TRANSIT
    route_id: str = ""

    @property
    def spare_capacity_kg(self) -> float:
        return self.total_capacity_kg - self.used_capacity_kg


class ShipmentAssignment(BaseModel):
    id: str
    shipment_id: str
    vehicle_id: str
    leg_index: int
    from_hub_id: str
    to_hub_id: str
    scheduled_departure: float = 0.0  # sim hours
    scheduled_arrival: float = 0.0  # sim hours
    actual_arrival: Optional[float] = None
    status: AssignmentStatus = AssignmentStatus.PENDING


class Shipment(BaseModel):
    id: str
    origin_hub_id: str
    destination_hub_id: str
    current_location: GeoPoint
    planned_route_id: str = ""
    deadline: float = 0.0  # sim hours from start
    priority: str = "STANDARD"
    weight_kg: float
    value_usd: float = 0.0
    status: ShipmentStatus = ShipmentStatus.IN_TRANSIT
    last_scan_event_at: float = 0.0  # sim hours
    assigned_vehicle_id: Optional[str] = None
    current_leg_index: int = 0
    recovery_pickup_hub_id: Optional[str] = None
    recovery_option_id: Optional[str] = None


class ScoreBreakdown(BaseModel):
    raw_values: dict = Field(default_factory=dict)
    normalized_values: dict = Field(default_factory=dict)
    weights: dict = Field(default_factory=dict)
    weighted_contributions: dict = Field(default_factory=dict)
    final_score: float = 0.0


class RecoveryOption(BaseModel):
    id: str
    shipment_id: str
    rank: int = 0
    strategy_label: str
    piggyback_mode: PiggybackMode
    vehicle_ids: list[str] = Field(default_factory=list)
    transfer_hub_ids: list[str] = Field(default_factory=list)
    estimated_cost_usd: float = 0.0
    dedicated_cost_usd: float = 0.0
    cost_saved_usd: float = 0.0
    estimated_delay_hours: float = 0.0
    estimated_arrival: float = 0.0
    co2_saved_kg: float = 0.0
    utilization_gain: float = 0.0
    score: float = 0.0
    score_breakdown: ScoreBreakdown = Field(default_factory=ScoreBreakdown)
    explanation: str = ""
    feasible: bool = True


class RecoveryEvent(BaseModel):
    id: str
    shipment_id: str
    detected_at: float = 0.0
    detection_reason: str = ""
    severity: Severity = Severity.MEDIUM
    candidates_evaluated: int = 0
    chosen_option: Optional[str] = None
    status: RecoveryEventStatus = RecoveryEventStatus.DETECTED


class Metrics(BaseModel):
    money_saved_usd: float = 0.0
    time_saved_hours: float = 0.0
    space_used_pct: float = 0.0
    co2_saved_kg: float = 0.0
    packages_rescued: int = 0
    total_lost: int = 0
    total_recovering: int = 0
    total_recovered: int = 0
    total_delivered: int = 0
    total_in_transit: int = 0
    total_disrupted: int = 0


class SimulationState(BaseModel):
    tick: int = 0
    sim_time_hours: float = 0.0
    running: bool = True
    speed_multiplier: float = 1.0
    hubs: list[Hub] = Field(default_factory=list)
    vehicles: list[Vehicle] = Field(default_factory=list)
    shipments: list[Shipment] = Field(default_factory=list)
    assignments: list[ShipmentAssignment] = Field(default_factory=list)
    routes: list[Route] = Field(default_factory=list)
    events: list[RecoveryEvent] = Field(default_factory=list)
    metrics: Metrics = Field(default_factory=Metrics)
    event_log: list[dict] = Field(default_factory=list)

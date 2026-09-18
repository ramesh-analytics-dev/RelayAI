export type HubStatus = "ACTIVE" | "CLOSED";
export type VehicleType = "TRUCK" | "VAN" | "RAIL" | "AIR";
export type VehicleStatus = "IN_TRANSIT" | "AT_HUB" | "COMPLETED";
export type ShipmentStatus = "IN_TRANSIT" | "MISPLACED" | "RECOVERING" | "RECOVERED" | "DELIVERED" | "DISRUPTED";
export type AssignmentStatus = "PENDING" | "IN_TRANSIT" | "COMPLETED" | "MISSED" | "CANCELLED";
export type Severity = "LOW" | "MEDIUM" | "HIGH";
export type PiggybackMode = "DIRECT" | "CONSOLIDATION" | "MULTI_HOP" | "REPOSITIONING";
export type RecoveryEventStatus = "DETECTED" | "CANDIDATES_FOUND" | "RECOVERY_CHOSEN" | "RECOVERING" | "RECOVERED" | "FAILED";

export interface GeoPoint { lat: number; lng: number; }
export interface Hub {
  id: string; name: string; lat: number; lng: number;
  status: HubStatus; transfer_time_hours: number; handling_cost_per_kg: number;
}
export interface RouteLeg { from_hub_id: string; to_hub_id: string; distance_km: number; }
export interface Route { id: string; hub_sequence: string[]; legs: RouteLeg[]; }
export interface Vehicle {
  id: string; type: VehicleType; route_hub_sequence: string[];
  current_position: GeoPoint; current_leg_index: number; progress_on_leg_km: number;
  total_capacity_kg: number; used_capacity_kg: number; cost_per_km: number;
  speed_kmh: number; status: VehicleStatus; route_id: string;
}
export interface ShipmentAssignment {
  id: string; shipment_id: string; vehicle_id: string; leg_index: number;
  from_hub_id: string; to_hub_id: string; scheduled_departure: number;
  scheduled_arrival: number; actual_arrival: number | null; status: AssignmentStatus;
}
export interface Shipment {
  id: string; origin_hub_id: string; destination_hub_id: string;
  current_location: GeoPoint; planned_route_id: string; deadline: number;
  priority: string; weight_kg: number; value_usd: number;
  status: ShipmentStatus; last_scan_event_at: number;
  assigned_vehicle_id: string | null; current_leg_index: number;
  recovery_pickup_hub_id: string | null; recovery_option_id: string | null;
}
export interface ScoreBreakdown {
  raw_values: Record<string, number>; normalized_values: Record<string, number>;
  weights: Record<string, number>; weighted_contributions: Record<string, number>;
  final_score: number;
}
export interface RecoveryOption {
  id: string; shipment_id: string; rank: number; strategy_label: string;
  piggyback_mode: PiggybackMode; vehicle_ids: string[]; transfer_hub_ids: string[];
  estimated_cost_usd: number; dedicated_cost_usd: number; cost_saved_usd: number;
  estimated_delay_hours: number; estimated_arrival: number; co2_saved_kg: number;
  utilization_gain: number; score: number; score_breakdown: ScoreBreakdown;
  explanation: string; feasible: boolean;
}
export interface RecoveryEvent {
  id: string; shipment_id: string; detected_at: number; detection_reason: string;
  severity: Severity; candidates_evaluated: number; chosen_option: string | null;
  status: RecoveryEventStatus;
}
export interface Metrics {
  money_saved_usd: number; time_saved_hours: number; space_used_pct: number;
  co2_saved_kg: number; packages_rescued: number; total_lost: number;
  total_recovering: number; total_recovered: number; total_delivered: number;
  total_in_transit: number; total_disrupted: number;
}
export interface EventLogEntry {
  tick: number; sim_time: number; type: string; message: string;
  [key: string]: unknown;
}
export interface SimulationState {
  tick: number; sim_time_hours: number; running: boolean; speed_multiplier: number;
  hubs: Hub[]; vehicles: Vehicle[]; shipments: Shipment[]; routes: Route[];
  assignments: ShipmentAssignment[]; events: RecoveryEvent[];
  metrics: Metrics; event_log: EventLogEntry[];
}

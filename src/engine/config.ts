export const SIM_SEED = 42;
export const NUM_HUBS = 20;
export const NUM_VEHICLES = 30;
export const NUM_SHIPMENTS = 100;
export const HUB_CENTER: [number, number] = [28.0, 77.0];
export const HUB_JITTER = 1.5;
export const STALE_SCAN_HOURS = 8;
export const ROUTE_DEVIATION_KM = 50;
export const MISSED_CONNECTION_BUFFER_HOURS = 1;
export const DEDICATED_COST_PER_KM = 2.5;
export const EMISSION_FACTOR = 0.05;
export const PIGGYBACK_EMISSION_FRACTION = 0.10;
export const TICK_HOURS = 1;
export const MISPLACEMENT_RATE = 0.03;

export const DEFAULT_WEIGHTS: Record<string, number> = {
  w_cost: 0.30, w_time: 0.25, w_util: 0.20, w_priority: 0.15, w_co2: 0.10,
};
export const PRIORITY_WEIGHTS: Record<string, number> = {
  PLATINUM: 1.0, GOLD: 0.75, SILVER: 0.5, STANDARD: 0.25,
};
export const VEHICLE_SPEEDS: Record<string, number> = {
  TRUCK: 60, VAN: 50, RAIL: 80, AIR: 600,
};
export const VEHICLE_COST_PER_KM: Record<string, number> = {
  TRUCK: 1.2, VAN: 0.8, RAIL: 0.5, AIR: 5.0,
};
export const VEHICLE_CAPACITY_RANGE: Record<string, [number, number]> = {
  TRUCK: [500, 2000], VAN: [200, 800], RAIL: [2000, 10000], AIR: [100, 500],
};
export const VEHICLE_TYPE_WEIGHTS: Record<string, number> = {
  TRUCK: 0.5, VAN: 0.25, RAIL: 0.15, AIR: 0.10,
};
export const PRIORITY_DISTRIBUTION: Record<string, number> = {
  PLATINUM: 0.10, GOLD: 0.20, SILVER: 0.30, STANDARD: 0.40,
};
export const INDIAN_CITIES = [
  "Delhi", "Mumbai", "Bangalore", "Chennai", "Kolkata",
  "Hyderabad", "Pune", "Ahmedabad", "Jaipur", "Lucknow",
  "Kanpur", "Nagpur", "Indore", "Bhopal", "Patna",
  "Surat", "Vadodara", "Ghaziabad", "Ludhiana", "Agra",
];

export interface SimConfig {
  seed: number; num_hubs: number; num_vehicles: number; num_shipments: number;
  hub_center: [number, number]; hub_jitter: number; tick_hours: number;
  misplacement_rate: number; stale_scan_hours: number; route_deviation_km: number;
  missed_connection_buffer_hours: number; dedicated_cost_per_km: number;
  emission_factor: number; piggyback_emission_fraction: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  seed: SIM_SEED, num_hubs: NUM_HUBS, num_vehicles: NUM_VEHICLES,
  num_shipments: NUM_SHIPMENTS, hub_center: HUB_CENTER, hub_jitter: HUB_JITTER,
  tick_hours: TICK_HOURS, misplacement_rate: MISPLACEMENT_RATE,
  stale_scan_hours: STALE_SCAN_HOURS, route_deviation_km: ROUTE_DEVIATION_KM,
  missed_connection_buffer_hours: MISSED_CONNECTION_BUFFER_HOURS,
  dedicated_cost_per_km: DEDICATED_COST_PER_KM, emission_factor: EMISSION_FACTOR,
  piggyback_emission_fraction: PIGGYBACK_EMISSION_FRACTION,
};

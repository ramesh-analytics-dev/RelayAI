import { RNG } from "./rng";
import { SimConfig, DEFAULT_CONFIG, INDIAN_CITIES, VEHICLE_CAPACITY_RANGE, VEHICLE_COST_PER_KM, VEHICLE_SPEEDS, VEHICLE_TYPE_WEIGHTS, PRIORITY_DISTRIBUTION } from "./config";
import { haversine_km } from "./geo";
import type { Hub, Route, RouteLeg, Vehicle, Shipment, ShipmentAssignment, GeoPoint } from "../types";
import type { VehicleType } from "../types";

export function generateHubs(rng: RNG, config: SimConfig): Hub[] {
  const hubs: Hub[] = [];
  for (let i = 0; i < config.num_hubs; i++) {
    const name = INDIAN_CITIES[i % INDIAN_CITIES.length];
    const lat = config.hub_center[0] + rng.uniform(-config.hub_jitter, config.hub_jitter);
    const lng = config.hub_center[1] + rng.uniform(-config.hub_jitter, config.hub_jitter);
    hubs.push({
      id: `H-${String(i + 1).padStart(2, "0")}`,
      name,
      lat: rng.round(lat, 4),
      lng: rng.round(lng, 4),
      status: "ACTIVE",
      transfer_time_hours: rng.round(rng.uniform(1.0, 4.0), 1),
      handling_cost_per_kg: rng.round(rng.uniform(0.2, 1.0), 2),
    });
  }
  return hubs;
}

export function generateRoutes(rng: RNG, hubs: Hub[], numRoutes: number): Route[] {
  const routes: Route[] = [];
  for (let i = 0; i < numRoutes; i++) {
    const numHops = rng.randint(2, 5);
    const chosen: string[] = [];
    let attempts = 0;
    while (chosen.length < numHops && attempts < 50) {
      const h = rng.choice(hubs);
      if (!chosen.includes(h.id)) chosen.push(h.id);
      attempts++;
    }
    const legs: RouteLeg[] = [];
    for (let j = 0; j < chosen.length - 1; j++) {
      const hFrom = hubs.find(h => h.id === chosen[j])!;
      const hTo = hubs.find(h => h.id === chosen[j + 1])!;
      legs.push({
        from_hub_id: chosen[j],
        to_hub_id: chosen[j + 1],
        distance_km: rng.round(haversine_km(hFrom.lat, hFrom.lng, hTo.lat, hTo.lng), 1),
      });
    }
    routes.push({ id: `R-${String(i + 1).padStart(4, "0")}`, hub_sequence: chosen, legs });
  }
  return routes;
}

export function generateVehicles(rng: RNG, routes: Route[], hubs: Hub[], config: SimConfig): Vehicle[] {
  const vehicles: Vehicle[] = [];
  const vTypes = Object.keys(VEHICLE_TYPE_WEIGHTS);
  const vWeights = vTypes.map(t => VEHICLE_TYPE_WEIGHTS[t]);
  for (let i = 0; i < config.num_vehicles; i++) {
    const route = routes[i % routes.length];
    const vtypeStr = rng.choices(vTypes, vWeights) as VehicleType;
    const [capMin, capMax] = VEHICLE_CAPACITY_RANGE[vtypeStr];
    const totalCap = rng.randint(capMin, capMax);
    const usedPct = rng.uniform(0, 0.7);
    const usedCap = rng.round(totalCap * usedPct, 1);
    const costPerKm = VEHICLE_COST_PER_KM[vtypeStr] * rng.uniform(0.8, 1.2);
    const speed = VEHICLE_SPEEDS[vtypeStr];
    const legIdx = rng.randint(0, Math.max(0, route.legs.length - 1));
    const progress = rng.uniform(0, route.legs[legIdx]?.distance_km || 0);
    const firstHub = hubs.find(h => h.id === route.hub_sequence[0]) || hubs[0];
    vehicles.push({
      id: `V-${String(i + 1).padStart(4, "0")}`,
      type: vtypeStr,
      route_hub_sequence: route.hub_sequence,
      current_position: { lat: firstHub.lat, lng: firstHub.lng },
      current_leg_index: legIdx,
      progress_on_leg_km: rng.round(progress, 1),
      total_capacity_kg: totalCap,
      used_capacity_kg: usedCap,
      cost_per_km: rng.round(costPerKm, 2),
      speed_kmh: speed,
      status: "IN_TRANSIT",
      route_id: route.id,
    });
  }
  return vehicles;
}

export function generateShipments(
  rng: RNG, hubs: Hub[], vehicles: Vehicle[], config: SimConfig,
): { shipments: Shipment[]; assignments: ShipmentAssignment[] } {
  const shipments: Shipment[] = [];
  const assignments: ShipmentAssignment[] = [];
  const priorities = Object.keys(PRIORITY_DISTRIBUTION);
  const priWeights = priorities.map(p => PRIORITY_DISTRIBUTION[p]);
  for (let i = 0; i < config.num_shipments; i++) {
    let origin = rng.choice(hubs);
    let dest = rng.choice(hubs);
    while (dest.id === origin.id) dest = rng.choice(hubs);
    const weight = rng.round(rng.uniform(10, 200), 1);
    const deadline = rng.uniform(48, 200);
    const priority = rng.choices(priorities, priWeights);
    const value = rng.round(weight * rng.uniform(10, 50), 2);
    const vehicle = rng.choice(vehicles);
    const legIdx = rng.randint(0, Math.max(0, vehicle.route_hub_sequence.length - 2));
    const fromHubId = vehicle.route_hub_sequence[legIdx];
    const toHubId = legIdx + 1 < vehicle.route_hub_sequence.length
      ? vehicle.route_hub_sequence[legIdx + 1]
      : vehicle.route_hub_sequence[vehicle.route_hub_sequence.length - 1];
    const fromHub = hubs.find(h => h.id === fromHubId)!;
    const shipId = `SHP-${String(i + 1).padStart(4, "0")}`;
    shipments.push({
      id: shipId,
      origin_hub_id: origin.id,
      destination_hub_id: dest.id,
      current_location: { lat: fromHub.lat, lng: fromHub.lng },
      planned_route_id: "",
      deadline: rng.round(deadline, 1),
      priority,
      weight_kg: weight,
      value_usd: value,
      status: "IN_TRANSIT",
      last_scan_event_at: 0,
      assigned_vehicle_id: vehicle.id,
      current_leg_index: legIdx,
      recovery_pickup_hub_id: null,
      recovery_option_id: null,
    });
    assignments.push({
      id: `A-${String(i + 1).padStart(4, "0")}`,
      shipment_id: shipId,
      vehicle_id: vehicle.id,
      leg_index: legIdx,
      from_hub_id: fromHubId,
      to_hub_id: toHubId,
      scheduled_departure: 0,
      scheduled_arrival: rng.round(deadline * 0.5, 1),
      actual_arrival: null,
      status: "IN_TRANSIT",
    });
  }
  return { shipments, assignments };
}

export function generateSimulation(config: SimConfig = DEFAULT_CONFIG) {
  const rng = new RNG(config.seed);
  const hubs = generateHubs(rng, config);
  const routes = generateRoutes(rng, hubs, Math.max(config.num_vehicles, 20));
  const vehicles = generateVehicles(rng, routes, hubs, config);
  const { shipments, assignments } = generateShipments(rng, hubs, vehicles, config);
  return { hubs, routes, vehicles, shipments, assignments, rng };
}

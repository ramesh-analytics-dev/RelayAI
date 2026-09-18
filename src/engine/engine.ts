import { RNG } from "./rng";
import { DEFAULT_CONFIG, DEFAULT_WEIGHTS, PRIORITY_WEIGHTS, SimConfig } from "./config";
import { generateSimulation } from "./generator";
import { haversine_km, interpolateOnLeg, minDistanceToRouteKm, nearestHub } from "./geo";
import type {
  Hub, Route, Vehicle, Shipment, ShipmentAssignment, RecoveryEvent,
  RecoveryOption, Metrics, EventLogEntry, GeoPoint, Severity, PiggybackMode,
} from "../types";

export interface EngineState {
  config: SimConfig;
  rng: RNG;
  tick: number;
  sim_time_hours: number;
  running: boolean;
  speed_multiplier: number;
  hubs: Hub[];
  routes: Route[];
  vehicles: Vehicle[];
  shipments: Shipment[];
  assignments: ShipmentAssignment[];
  events: RecoveryEvent[];
  recovery_options: Record<string, RecoveryOption[]>;
  metrics: Metrics;
  event_log: EventLogEntry[];

  hubs_by_id: Record<string, Hub>;
  vehicles_by_id: Record<string, Vehicle>;
  shipments_by_id: Record<string, Shipment>;
  routes_by_id: Record<string, Route>;
}

function makeMetrics(): Metrics {
  return {
    money_saved_usd: 0, time_saved_hours: 0, space_used_pct: 0,
    co2_saved_kg: 0, packages_rescued: 0, total_lost: 0, total_recovering: 0,
    total_recovered: 0, total_delivered: 0, total_in_transit: 0, total_disrupted: 0,
  };
}

export function createEngine(config: SimConfig = DEFAULT_CONFIG): EngineState {
  const data = generateSimulation(config);
  const state: EngineState = {
    config,
    rng: data.rng,
    tick: 0,
    sim_time_hours: 0,
    running: true,
    speed_multiplier: 1,
    hubs: data.hubs,
    routes: data.routes,
    vehicles: data.vehicles,
    shipments: data.shipments,
    assignments: data.assignments,
    events: [],
    recovery_options: {},
    metrics: makeMetrics(),
    event_log: [],
    hubs_by_id: {},
    vehicles_by_id: {},
    shipments_by_id: {},
    routes_by_id: {},
  };
  rebuildIndexes(state);
  return state;
}

function rebuildIndexes(state: EngineState) {
  state.hubs_by_id = {};
  state.vehicles_by_id = {};
  state.shipments_by_id = {};
  state.routes_by_id = {};
  for (const h of state.hubs) state.hubs_by_id[h.id] = h;
  for (const v of state.vehicles) state.vehicles_by_id[v.id] = v;
  for (const s of state.shipments) state.shipments_by_id[s.id] = s;
  for (const r of state.routes) state.routes_by_id[r.id] = r;
}

export function addLog(state: EngineState, type: string, message: string, extra: Record<string, unknown> = {}) {
  state.event_log.push({ tick: state.tick, sim_time: Math.round(state.sim_time_hours * 10) / 10, type, message, ...extra });
  if (state.event_log.length > 500) state.event_log = state.event_log.slice(-500);
}

export function updateMetrics(state: EngineState) {
  const counts: Record<string, number> = {};
  for (const s of state.shipments) counts[s.status] = (counts[s.status] || 0) + 1;
  state.metrics.total_in_transit = counts["IN_TRANSIT"] || 0;
  state.metrics.total_lost = counts["MISPLACED"] || 0;
  state.metrics.total_recovering = counts["RECOVERING"] || 0;
  state.metrics.total_recovered = counts["RECOVERED"] || 0;
  state.metrics.total_delivered = counts["DELIVERED"] || 0;
  state.metrics.total_disrupted = counts["DISRUPTED"] || 0;
}

// === SIMULATION TICK ===

export function tick(state: EngineState) {
  state.tick++;
  const dtHours = state.config.tick_hours * state.speed_multiplier;
  state.sim_time_hours += dtHours;
  advanceVehicles(state, dtHours);
  updateShipmentPositions(state, dtHours);
  completeLegsAndAssignments(state);
  induceAnomalies(state, dtHours);
}

function advanceVehicles(state: EngineState, dtHours: number) {
  for (const v of state.vehicles) {
    if (v.status === "COMPLETED") continue;
    let remaining = v.speed_kmh * dtHours;
    const seq = v.route_hub_sequence;
    while (remaining > 0) {
      const fromIdx = v.current_leg_index;
      const toIdx = (fromIdx + 1) % seq.length;
      const hFrom = state.hubs_by_id[seq[fromIdx]];
      const hTo = state.hubs_by_id[seq[toIdx]];
      if (!hFrom || !hTo) break;
      const route = state.routes_by_id[v.route_id];
      const leg = route && fromIdx < route.legs.length ? route.legs[fromIdx] : null;
      const legDist = leg ? leg.distance_km : haversine_km(hFrom.lat, hFrom.lng, hTo.lat, hTo.lng);
      const remainingOnLeg = legDist - v.progress_on_leg_km;
      if (remaining < remainingOnLeg) {
        v.progress_on_leg_km += remaining;
        remaining = 0;
        const frac = legDist > 0 ? v.progress_on_leg_km / legDist : 1;
        v.current_position = interpolateOnLeg(
          { lat: hFrom.lat, lng: hFrom.lng },
          { lat: hTo.lat, lng: hTo.lng },
          frac,
        );
        v.status = "IN_TRANSIT";
      } else {
        v.progress_on_leg_km = 0;
        v.current_leg_index = toIdx;
        remaining -= remainingOnLeg;
        v.current_position = { lat: hTo.lat, lng: hTo.lng };
        v.status = "AT_HUB";
      }
    }
  }
}

function updateShipmentPositions(state: EngineState, _dtHours: number) {
  for (const s of state.shipments) {
    if (s.status !== "IN_TRANSIT" && s.status !== "RECOVERING") continue;
    const v = s.assigned_vehicle_id ? state.vehicles_by_id[s.assigned_vehicle_id] : null;
    if (v && v.status === "IN_TRANSIT") {
      s.current_location = { lat: v.current_position.lat, lng: v.current_position.lng };
    }
    if (s.status === "IN_TRANSIT") {
      s.last_scan_event_at = state.sim_time_hours;
    }
  }
}

function completeLegsAndAssignments(state: EngineState) {
  for (const a of state.assignments) {
    if (a.status !== "IN_TRANSIT") continue;
    const v = state.vehicles_by_id[a.vehicle_id];
    if (!v) continue;
    // Check if vehicle is currently at the assignment's destination hub
    const currentHubId = v.route_hub_sequence[v.current_leg_index];
    if (currentHubId === a.to_hub_id && v.status === "AT_HUB") {
      a.actual_arrival = state.sim_time_hours;
      a.status = "COMPLETED";
      const ship = state.shipments_by_id[a.shipment_id];
      if (ship) {
        const toHub = state.hubs_by_id[a.to_hub_id];
        if (toHub) ship.current_location = { lat: toHub.lat, lng: toHub.lng };
        ship.last_scan_event_at = state.sim_time_hours;
        if (a.to_hub_id === ship.destination_hub_id) {
          ship.status = "DELIVERED";
          v.used_capacity_kg = Math.max(0, v.used_capacity_kg - ship.weight_kg);
        } else if (ship.status === "RECOVERING") {
          ship.status = "RECOVERED";
        }
      }
    }
  }
}

function induceAnomalies(state: EngineState, dtHours: number) {
  const inTransit = state.shipments.filter(s => s.status === "IN_TRANSIT");
  for (const s of inTransit) {
    if (state.rng.next() > state.config.misplacement_rate * dtHours) continue;
    const scenario = state.rng.choice(["A", "B", "C"]);
    if (scenario === "A") {
      s.last_scan_event_at = state.sim_time_hours - state.config.stale_scan_hours - state.rng.uniform(1, 5);
    } else if (scenario === "B") {
      s.current_location = {
        lat: s.current_location.lat + state.rng.uniform(-2, 2),
        lng: s.current_location.lng + state.rng.uniform(-2, 2),
      };
    } else {
      s.last_scan_event_at = state.sim_time_hours - state.config.stale_scan_hours - state.rng.uniform(1, 3);
    }
  }
}

// === DETECTION ===

export function runDetection(state: EngineState): RecoveryEvent[] {
  const skip = new Set(["MISPLACED", "RECOVERING", "RECOVERED", "DELIVERED", "DISRUPTED"]);
  const newEvents: RecoveryEvent[] = [];
  for (const s of state.shipments) {
    if (skip.has(s.status)) continue;
    if (s.status !== "IN_TRANSIT") continue;
    const [reason, severity] = checkDetection(state, s);
    if (!reason) continue;
    const pickup = nearestHub(s.current_location, state.hubs, true);
    s.recovery_pickup_hub_id = pickup ? pickup.id : null;
    s.status = "MISPLACED";
    const evt: RecoveryEvent = {
      id: `EVT-${s.id}-${state.tick}`,
      shipment_id: s.id,
      detected_at: state.sim_time_hours,
      detection_reason: reason,
      severity,
      candidates_evaluated: 0,
      chosen_option: null,
      status: "DETECTED",
    };
    state.events.push(evt);
    newEvents.push(evt);
    addLog(state, "detection", `Package ${s.id} flagged as lost: ${reason}`, { shipment_id: s.id, severity });
  }
  return newEvents;
}

function checkDetection(state: EngineState, s: Shipment): [string | null, Severity] {
  // Rule 1: Stale scan
  const scanAge = state.sim_time_hours - s.last_scan_event_at;
  if (scanAge > state.config.stale_scan_hours) {
    return [`Stale scan: last scan ${scanAge.toFixed(1)}h ago (threshold ${state.config.stale_scan_hours}h)`, "MEDIUM"];
  }
  // Rule 2: Route deviation
  let route = s.planned_route_id ? state.routes_by_id[s.planned_route_id] : null;
  if (!route && s.assigned_vehicle_id) {
    const v = state.vehicles_by_id[s.assigned_vehicle_id];
    if (v) route = state.routes_by_id[v.route_id];
  }
  if (route) {
    const dist = minDistanceToRouteKm(s.current_location, route, state.hubs_by_id);
    if (dist > state.config.route_deviation_km) {
      return [`Route deviation: ${dist.toFixed(1)}km from planned route (threshold ${state.config.route_deviation_km}km)`, "HIGH"];
    }
  }
  // Rule 3: Missed connection
  if (s.assigned_vehicle_id) {
    const v = state.vehicles_by_id[s.assigned_vehicle_id];
    if (v && v.current_leg_index > s.current_leg_index) {
      const nextHubId = s.current_leg_index + 1 < v.route_hub_sequence.length
        ? v.route_hub_sequence[s.current_leg_index + 1] : null;
      if (nextHubId) {
        const scanGap = state.sim_time_hours - s.last_scan_event_at;
        if (scanGap > state.config.missed_connection_buffer_hours) {
          const vShort = v.id.replace("V-", "V");
          return [`Missed connection: vehicle ${vShort} completed leg but package was not scanned at next hub`, "HIGH"];
        }
      }
    }
  }
  return [null, "MEDIUM"];
}

// === SEARCH ===

interface SearchCandidate {
  vehicle: Vehicle; route: Route; current_position: GeoPoint; spare_capacity_kg: number;
}

export function runSearch(state: EngineState): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];
  for (const v of state.vehicles) {
    if (v.status === "COMPLETED") continue;
    const spare = v.total_capacity_kg - v.used_capacity_kg;
    if (spare <= 0) continue;
    let routeHasClosed = false;
    for (const hid of v.route_hub_sequence) {
      const h = state.hubs_by_id[hid];
      if (h && h.status === "CLOSED") { routeHasClosed = true; break; }
    }
    if (routeHasClosed) continue;
    const route = state.routes_by_id[v.route_id];
    if (!route) continue;
    candidates.push({ vehicle: v, route, current_position: v.current_position, spare_capacity_kg: spare });
  }
  return candidates;
}

// === MATCHING ===

interface MatchCandidate {
  strategy: PiggybackMode; vehicle_ids: string[]; transfer_hub_ids: string[];
  pickup_hub_id: string; destination_hub_id: string;
  vehicle: Vehicle; vehicle_b?: Vehicle; route: Route;
  spare_capacity_kg: number; eta_hours: number; distance_km: number;
  transfer_time_hours?: number;
}

function etaForSegment(state: EngineState, v: Vehicle, fromIdx: number, toIdx: number): number {
  const seq = v.route_hub_sequence;
  let total = 0;
  let i = fromIdx;
  while (i !== toIdx) {
    const nextI = (i + 1) % seq.length;
    const route = state.routes_by_id[v.route_id];
    const leg = route && i < route.legs.length ? route.legs[i] : null;
    let dist: number;
    if (leg) dist = leg.distance_km;
    else {
      const hFrom = state.hubs_by_id[seq[i]];
      const hTo = state.hubs_by_id[seq[nextI]];
      dist = hFrom && hTo ? haversine_km(hFrom.lat, hFrom.lng, hTo.lat, hTo.lng) : 0;
    }
    if (i === v.current_leg_index) {
      total += Math.max(0, dist - v.progress_on_leg_km) / v.speed_kmh;
    } else {
      total += dist / v.speed_kmh;
    }
    i = nextI;
    if (i === fromIdx) break;
  }
  return total + state.sim_time_hours;
}

function segmentDistance(state: EngineState, v: Vehicle, fromIdx: number, toIdx: number): number {
  const seq = v.route_hub_sequence;
  let total = 0;
  let i = fromIdx;
  while (i !== toIdx) {
    const nextI = (i + 1) % seq.length;
    const route = state.routes_by_id[v.route_id];
    if (route && i < route.legs.length) total += route.legs[i].distance_km;
    else {
      const hFrom = state.hubs_by_id[seq[i]];
      const hTo = state.hubs_by_id[seq[nextI]];
      if (hFrom && hTo) total += haversine_km(hFrom.lat, hFrom.lng, hTo.lat, hTo.lng);
    }
    i = nextI;
    if (i === fromIdx) break;
  }
  return total;
}

export function findCandidates(state: EngineState, shipment: Shipment, searchCandidates: SearchCandidate[]): MatchCandidate[] {
  const results: MatchCandidate[] = [];
  const destHub = state.hubs_by_id[shipment.destination_hub_id];
  if (!destHub) return results;

  for (const cand of searchCandidates) {
    const v = cand.vehicle;
    const spare = cand.spare_capacity_kg;
    const direct = tryDirect(state, shipment, v, cand.route, spare);
    if (direct) { results.push(direct); continue; }
    const consol = tryConsolidation(state, shipment, v, cand.route, spare);
    if (consol) results.push(consol);
  }

  const multi = findMultiHop(state, shipment, searchCandidates);
  results.push(...multi);

  if (results.length === 0) {
    const reposition = tryRepositioning(state, shipment, searchCandidates);
    results.push(...reposition);
  }

  return results;
}

function tryDirect(state: EngineState, s: Shipment, v: Vehicle, route: Route, spare: number): MatchCandidate | null {
  const destId = s.destination_hub_id;
  if (!v.route_hub_sequence.includes(destId)) return null;
  const di = v.route_hub_sequence.indexOf(destId);
  if (spare < s.weight_kg) return null;

  // Try the recovery pickup hub first, then fall back to vehicle's current hub
  const pickupCandidates: string[] = [];
  if (s.recovery_pickup_hub_id) pickupCandidates.push(s.recovery_pickup_hub_id);
  const currentHubId = v.route_hub_sequence[v.current_leg_index];
  if (currentHubId && !pickupCandidates.includes(currentHubId)) pickupCandidates.push(currentHubId);
  // Also try the nearest hub to the vehicle's current position
  const vNearest = nearestHub(v.current_position, state.hubs, true);
  if (vNearest && !pickupCandidates.includes(vNearest.id)) pickupCandidates.push(vNearest.id);

  for (const pickupId of pickupCandidates) {
    if (pickupId === destId) continue;
    if (!v.route_hub_sequence.includes(pickupId)) continue;
    const pi = v.route_hub_sequence.indexOf(pickupId);
    const eta = etaForSegment(state, v, pi, di);
    if (eta > s.deadline) continue;
    return {
      strategy: "DIRECT", vehicle_ids: [v.id], transfer_hub_ids: [],
      pickup_hub_id: pickupId, destination_hub_id: destId,
      vehicle: v, route, spare_capacity_kg: spare,
      eta_hours: eta, distance_km: segmentDistance(state, v, pi, di),
    };
  }
  return null;
}

function tryConsolidation(state: EngineState, s: Shipment, v: Vehicle, route: Route, spare: number): MatchCandidate | null {
  for (const other of state.shipments) {
    if (other.id === s.id) continue;
    if (other.assigned_vehicle_id !== v.id) continue;
    if (other.destination_hub_id !== s.destination_hub_id) continue;
    if (spare < s.weight_kg) return null;
    const pickupId = s.recovery_pickup_hub_id;
    if (!pickupId || pickupId === s.destination_hub_id) continue;
    if (!v.route_hub_sequence.includes(pickupId)) continue;
    if (!v.route_hub_sequence.includes(s.destination_hub_id)) continue;
    const pi = v.route_hub_sequence.indexOf(pickupId);
    const di = v.route_hub_sequence.indexOf(s.destination_hub_id);
    const eta = etaForSegment(state, v, pi, di);
    if (eta > s.deadline) continue;
    return {
      strategy: "CONSOLIDATION", vehicle_ids: [v.id], transfer_hub_ids: [],
      pickup_hub_id: pickupId, destination_hub_id: s.destination_hub_id,
      vehicle: v, route, spare_capacity_kg: spare,
      eta_hours: eta, distance_km: segmentDistance(state, v, pi, di),
    };
  }
  return null;
}

function findMultiHop(state: EngineState, s: Shipment, searchCandidates: SearchCandidate[]): MatchCandidate[] {
  const results: MatchCandidate[] = [];
  const destId = s.destination_hub_id;

  for (const candA of searchCandidates) {
    const vA = candA.vehicle;
    if (candA.spare_capacity_kg < s.weight_kg) continue;

    // Try multiple pickup hubs for vehicle A
    const pickupCandidates: string[] = [];
    if (s.recovery_pickup_hub_id) pickupCandidates.push(s.recovery_pickup_hub_id);
    const currentHubA = vA.route_hub_sequence[vA.current_leg_index];
    if (currentHubA && !pickupCandidates.includes(currentHubA)) pickupCandidates.push(currentHubA);

    for (const pickupId of pickupCandidates) {
      if (pickupId === destId) continue;
      if (!vA.route_hub_sequence.includes(pickupId)) continue;
      const piA = vA.route_hub_sequence.indexOf(pickupId);
      // Try every other hub on vA's route as a transfer point
      for (let transferIdx = 0; transferIdx < vA.route_hub_sequence.length; transferIdx++) {
        if (transferIdx === piA) continue;
        const transferId = vA.route_hub_sequence[transferIdx];
        const transferHub = state.hubs_by_id[transferId];
        if (!transferHub || transferHub.status === "CLOSED") continue;
        if (transferId === destId) continue;
        const etaA = etaForSegment(state, vA, piA, transferIdx);
        for (const candB of searchCandidates) {
          const vB = candB.vehicle;
          if (vB.id === vA.id) continue;
          if (!vB.route_hub_sequence.includes(transferId)) continue;
          if (!vB.route_hub_sequence.includes(destId)) continue;
          const tiB = vB.route_hub_sequence.indexOf(transferId);
          const diB = vB.route_hub_sequence.indexOf(destId);
          if (candB.spare_capacity_kg < s.weight_kg) continue;
          const transferTime = transferHub.transfer_time_hours;
          const etaB = etaForSegment(state, vB, tiB, diB);
          const totalEta = etaA + transferTime + etaB;
          if (totalEta > s.deadline) continue;
          const distA = segmentDistance(state, vA, piA, transferIdx);
          const distB = segmentDistance(state, vB, tiB, diB);
          results.push({
            strategy: "MULTI_HOP", vehicle_ids: [vA.id, vB.id], transfer_hub_ids: [transferId],
            pickup_hub_id: pickupId, destination_hub_id: destId,
            vehicle: vA, vehicle_b: vB, route: candA.route,
            spare_capacity_kg: Math.min(candA.spare_capacity_kg, candB.spare_capacity_kg),
            eta_hours: totalEta, distance_km: distA + distB, transfer_time_hours: transferTime,
          });
          if (results.length >= 10) return results;
        }
      }
    }
  }
  return results;
}

function tryRepositioning(state: EngineState, s: Shipment, searchCandidates: SearchCandidate[]): MatchCandidate[] {
  const pickupId = s.recovery_pickup_hub_id;
  const destId = s.destination_hub_id;
  if (!pickupId) return [];
  const pickupHub = state.hubs_by_id[pickupId];
  if (!pickupHub) return [];
  let bestHub: Hub | null = null;
  let bestDist = Infinity;
  for (const h of state.hubs) {
    if (h.status === "CLOSED" || h.id === pickupId) continue;
    const d = haversine_km(pickupHub.lat, pickupHub.lng, h.lat, h.lng);
    if (d < bestDist) { bestDist = d; bestHub = h; }
  }
  if (!bestHub) return [];
  for (const cand of searchCandidates) {
    const v = cand.vehicle;
    if (!v.route_hub_sequence.includes(bestHub.id) || !v.route_hub_sequence.includes(destId)) continue;
    if (bestHub.id === destId) continue;
    const hi = v.route_hub_sequence.indexOf(bestHub.id);
    const di = v.route_hub_sequence.indexOf(destId);
    if (cand.spare_capacity_kg < s.weight_kg) continue;
    const eta = etaForSegment(state, v, hi, di) + bestDist / 50;
    if (eta > s.deadline) continue;
    return [{
      strategy: "REPOSITIONING", vehicle_ids: [v.id], transfer_hub_ids: [bestHub.id],
      pickup_hub_id: bestHub.id, destination_hub_id: destId,
      vehicle: v, route: cand.route, spare_capacity_kg: cand.spare_capacity_kg,
      eta_hours: eta, distance_km: segmentDistance(state, v, hi, di) + bestDist,
    }];
  }
  return [];
}

// === EVALUATION ===

const STRATEGY_LABELS: Record<PiggybackMode, string> = {
  DIRECT: "SAME TRUCK, STRAIGHT THERE",
  CONSOLIDATION: "SHARED DELIVERY",
  MULTI_HOP: "TWO-VEHICLE RELAY",
  REPOSITIONING: "REPOSITION & RESHIP",
};

export function evaluate(state: EngineState, shipment: Shipment, candidates: MatchCandidate[], weights?: Record<string, number>): RecoveryOption[] {
  const w = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  for (const [k, val] of Object.entries(w)) {
    if (val < 0) throw new Error(`Weight ${k} must be >= 0`);
  }
  if (Object.values(w).reduce((a, b) => a + b, 0) === 0) throw new Error("Sum of weights must be > 0");

  const options: RecoveryOption[] = candidates.map((cand, i) => evaluateOne(state, shipment, cand, i));
  if (options.length === 0) return [];
  normalizeAndScore(options, shipment, w);
  return options;
}

function evaluateOne(state: EngineState, s: Shipment, cand: MatchCandidate, idx: number): RecoveryOption {
  const v = cand.vehicle;
  const distance = cand.distance_km;
  const spare = cand.spare_capacity_kg;
  const eta = cand.eta_hours;

  let piggybackCost = distance * v.cost_per_km;
  if (cand.transfer_time_hours && cand.transfer_hub_ids.length > 0) {
    const transferHub = state.hubs_by_id[cand.transfer_hub_ids[0]];
    if (transferHub) piggybackCost += transferHub.handling_cost_per_kg * s.weight_kg;
  }
  let dedicatedCost = distance * state.config.dedicated_cost_per_km;
  if (cand.transfer_time_hours && cand.transfer_hub_ids.length > 0) {
    const transferHub = state.hubs_by_id[cand.transfer_hub_ids[0]];
    if (transferHub) dedicatedCost += transferHub.handling_cost_per_kg * s.weight_kg;
  }
  const costSaved = dedicatedCost - piggybackCost;
  const delay = eta - s.deadline;
  const spaceUsed = spare > 0 ? s.weight_kg / spare : 1;
  const dedicatedCo2 = distance * state.config.emission_factor;
  const piggybackCo2 = distance * state.config.emission_factor * state.config.piggyback_emission_fraction;
  const co2Saved = dedicatedCo2 - piggybackCo2;

  return {
    id: `OPT-${s.id}-${idx + 1}`,
    shipment_id: s.id,
    rank: 0,
    strategy_label: STRATEGY_LABELS[cand.strategy] || cand.strategy,
    piggyback_mode: cand.strategy,
    vehicle_ids: cand.vehicle_ids,
    transfer_hub_ids: cand.transfer_hub_ids,
    estimated_cost_usd: Math.round(piggybackCost * 100) / 100,
    dedicated_cost_usd: Math.round(dedicatedCost * 100) / 100,
    cost_saved_usd: Math.round(costSaved * 100) / 100,
    estimated_delay_hours: Math.round(delay * 10) / 10,
    estimated_arrival: Math.round(eta * 10) / 10,
    co2_saved_kg: Math.round(co2Saved * 100) / 100,
    utilization_gain: Math.round(spaceUsed * 1000) / 1000,
    score: 0,
    score_breakdown: { raw_values: {}, normalized_values: {}, weights: {}, weighted_contributions: {}, final_score: 0 },
    explanation: "",
    feasible: true,
  };
}

function normalizeAndScore(options: RecoveryOption[], s: Shipment, w: Record<string, number>) {
  const priorityW = PRIORITY_WEIGHTS[s.priority] ?? 0.25;
  if (options.length === 1) {
    applyScore(options[0], { cost: 1, time: 1, util: 1, co2: 1 }, w, priorityW);
    return;
  }
  const costs = options.map(o => o.cost_saved_usd);
  const times = options.map(o => o.estimated_delay_hours);
  const utils = options.map(o => o.utilization_gain);
  const co2s = options.map(o => o.co2_saved_kg);
  const costRange = Math.max(...costs) - Math.min(...costs);
  const timeRange = Math.max(...times) - Math.min(...times);
  const utilRange = Math.max(...utils) - Math.min(...utils);
  const co2Range = Math.max(...co2s) - Math.min(...co2s);

  for (const opt of options) {
    const norm: Record<string, number> = {};
    norm.cost = costRange > 0 ? (opt.cost_saved_usd - Math.min(...costs)) / costRange : 1;
    norm.time = timeRange > 0 ? 1 - (opt.estimated_delay_hours - Math.min(...times)) / timeRange : 1;
    norm.time = Math.max(0, Math.min(1, norm.time));
    norm.util = utilRange > 0 ? (opt.utilization_gain - Math.min(...utils)) / utilRange : 1;
    norm.co2 = co2Range > 0 ? (opt.co2_saved_kg - Math.min(...co2s)) / co2Range : 1;
    applyScore(opt, norm, w, priorityW);
  }
}

function applyScore(opt: RecoveryOption, norm: Record<string, number>, w: Record<string, number>, priorityW: number) {
  const wCost = w.w_cost ?? 0.3, wTime = w.w_time ?? 0.25, wUtil = w.w_util ?? 0.2;
  const wPriority = w.w_priority ?? 0.15, wCo2 = w.w_co2 ?? 0.1;
  const contributions = {
    cost: wCost * norm.cost, time: wTime * norm.time, util: wUtil * norm.util,
    priority: wPriority * priorityW, co2: wCo2 * norm.co2,
  };
  const score = Object.values(contributions).reduce((a, b) => a + b, 0);
  opt.score = Math.round(score * 10000) / 10000;
  opt.score_breakdown = {
    raw_values: { cost_saved: opt.cost_saved_usd, delay_hours: opt.estimated_delay_hours, utilization: opt.utilization_gain, co2_saved: opt.co2_saved_kg, priority_weight: priorityW },
    normalized_values: norm,
    weights: w,
    weighted_contributions: contributions,
    final_score: score,
  };
}

// === DECISION ===

export function decide(state: EngineState, shipment: Shipment, options: RecoveryOption[]): RecoveryOption[] {
  const ranked = [...options].sort((a, b) => b.score - a.score);
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].rank = i + 1;
    ranked[i].explanation = explain(state, shipment, ranked[i]);
  }
  return ranked.slice(0, 3);
}

function explain(state: EngineState, s: Shipment, opt: RecoveryOption): string {
  const v = state.vehicles_by_id[opt.vehicle_ids[0]];
  const typeNames: Record<string, string> = { TRUCK: "Truck", VAN: "Van", RAIL: "Train", AIR: "Plane" };
  const vLabel = v ? `${typeNames[v.type] || v.type} ${v.id.replace("V-", "V")}` : "vehicle";
  const parts: string[] = [];
  parts.push(opt.utilization_gain <= 1
    ? `${vLabel} has ${(opt.utilization_gain * 100).toFixed(0)}% space available`
    : `${vLabel} can accommodate your package`);
  if (opt.piggyback_mode === "MULTI_HOP" && opt.transfer_hub_ids.length > 0) {
    const transferHub = state.hubs_by_id[opt.transfer_hub_ids[0]];
    if (transferHub) parts.push(`transfers through ${transferHub.name}`);
  }
  parts.push(`Your package weighs ${s.weight_kg.toFixed(0)}kg, so it fits`);
  if (opt.estimated_delay_hours < 0) parts.push(`It arrives ${Math.abs(opt.estimated_delay_hours).toFixed(1)} hours early`);
  else if (opt.estimated_delay_hours === 0) parts.push("It arrives right on time");
  else parts.push(`It arrives ${opt.estimated_delay_hours.toFixed(1)} hours late`);
  if (opt.cost_saved_usd > 0) parts.push(`You save $${opt.cost_saved_usd.toFixed(0)} compared to a dedicated truck`);
  else parts.push(`It costs $${opt.estimated_cost_usd.toFixed(0)}`);
  if (opt.co2_saved_kg > 0) parts.push(`You save ${opt.co2_saved_kg.toFixed(1)}kg of CO2`);
  return parts.join(". ") + ".";
}

// === RECOVERY ===

export function recover(state: EngineState, shipmentId: string, optionRank: number): { success: boolean; error?: { code: string; message: string }; option?: RecoveryOption } {
  const ship = state.shipments_by_id[shipmentId];
  if (!ship) return { success: false, error: { code: "NOT_FOUND", message: `Package ${shipmentId} not found` } };
  if (ship.status !== "MISPLACED") return { success: false, error: { code: "RECOVERY_CONFLICT", message: "This package is no longer available for recovery." } };
  const options = state.recovery_options[shipmentId] || [];
  const chosen = options.find(o => o.rank === optionRank);
  if (!chosen) return { success: false, error: { code: "INVALID_OPTION", message: `Rescue plan #${optionRank} not found` } };

  for (const vid of chosen.vehicle_ids) {
    const v = state.vehicles_by_id[vid];
    if (!v) return { success: false, error: { code: "RECOVERY_CONFLICT", message: "Vehicle no longer available" } };
    if (v.total_capacity_kg - v.used_capacity_kg < ship.weight_kg)
      return { success: false, error: { code: "CAPACITY_CONFLICT", message: "Vehicle no longer has enough space" } };
  }
  for (const hid of chosen.transfer_hub_ids) {
    const h = state.hubs_by_id[hid];
    if (h && h.status === "CLOSED") return { success: false, error: { code: "HUB_CLOSED", message: "Transfer stop is closed" } };
  }
  if (chosen.estimated_arrival > ship.deadline)
    return { success: false, error: { code: "DEADLINE_MISSED", message: "This plan no longer meets the deadline" } };

  for (const a of state.assignments) {
    if (a.shipment_id === shipmentId && (a.status === "PENDING" || a.status === "IN_TRANSIT"))
      a.status = "CANCELLED";
  }

  const v = chosen.vehicle_ids.length > 0 ? state.vehicles_by_id[chosen.vehicle_ids[0]] : null;

  if (v) {
    v.used_capacity_kg += ship.weight_kg;
    const pickupId = chosen.transfer_hub_ids.length > 0 ? chosen.transfer_hub_ids[0] : ship.recovery_pickup_hub_id;
    const legIdx = pickupId && v.route_hub_sequence.includes(pickupId)
      ? v.route_hub_sequence.indexOf(pickupId) : v.current_leg_index;
    const destId = chosen.transfer_hub_ids.length > 1 ? chosen.transfer_hub_ids[chosen.transfer_hub_ids.length - 1] : ship.destination_hub_id;
    state.assignments.push({
      id: `REC-${shipmentId}-${state.tick}`,
      shipment_id: shipmentId, vehicle_id: chosen.vehicle_ids[0], leg_index: legIdx,
      from_hub_id: pickupId || "", to_hub_id: destId,
      scheduled_departure: state.sim_time_hours, scheduled_arrival: chosen.estimated_arrival,
      actual_arrival: null, status: "IN_TRANSIT",
    });
    ship.assigned_vehicle_id = chosen.vehicle_ids[0];
    ship.current_leg_index = legIdx;
    const pickupHub = pickupId ? state.hubs_by_id[pickupId] : null;
    if (pickupHub) { ship.current_location.lat = pickupHub.lat; ship.current_location.lng = pickupHub.lng; }

    ship.status = "RECOVERING";
    ship.recovery_option_id = chosen.id;
  } else if (chosen.transfer_hub_ids.length > 0) {
    // Fallback: no vehicle — transmit package directly to nearest node
    const targetHub = state.hubs_by_id[chosen.transfer_hub_ids[0]];
    if (targetHub) {
      ship.current_location = { lat: targetHub.lat, lng: targetHub.lng };
      ship.recovery_pickup_hub_id = targetHub.id;
      ship.assigned_vehicle_id = null;
      ship.last_scan_event_at = state.sim_time_hours;
      // Stay MISPLACED so new rescue plans can be generated from the new location
      ship.recovery_option_id = chosen.id;

      addLog(state, "recovery", `Package ${shipmentId} transmitted to ${targetHub.name} as fallback. Awaiting new rescue plans from there.`, { shipment_id: shipmentId });
    }
  }

  if (v) {
    for (let i = state.events.length - 1; i >= 0; i--) {
      const evt = state.events[i];
      if (evt.shipment_id === shipmentId && evt.status === "DETECTED") {
        evt.status = "RECOVERY_CHOSEN";
        evt.chosen_option = chosen.id;
        break;
      }
    }

    state.metrics.money_saved_usd += chosen.cost_saved_usd;
    state.metrics.co2_saved_kg += chosen.co2_saved_kg;
    state.metrics.packages_rescued += 1;
    if (chosen.estimated_delay_hours < 0) state.metrics.time_saved_hours += Math.abs(chosen.estimated_delay_hours);
    state.metrics.space_used_pct += chosen.utilization_gain * 100;

    addLog(state, "recovery", `Package ${shipmentId} rescue plan chosen: ${chosen.strategy_label}. ${chosen.cost_saved_usd.toFixed(0)} saved, ${chosen.co2_saved_kg.toFixed(1)}kg CO2 saved`, { shipment_id: shipmentId });
  }

  return { success: true, option: chosen };
}

export function checkRecoveryCompletion(state: EngineState) {
  for (const s of state.shipments) {
    if (s.status !== "RECOVERING") continue;
    const v = s.assigned_vehicle_id ? state.vehicles_by_id[s.assigned_vehicle_id] : null;
    if (!v) continue;
    if (v.current_leg_index >= v.route_hub_sequence.length - 1) {
      const lastHubId = v.route_hub_sequence[v.route_hub_sequence.length - 1];
      if (lastHubId === s.destination_hub_id) {
        s.status = "RECOVERED";
        v.used_capacity_kg = Math.max(0, v.used_capacity_kg - s.weight_kg);
        state.metrics.total_recovered += 1;
        addLog(state, "recovery", `Package ${s.id} rescued and delivered`, { shipment_id: s.id });
      }
    }
  }
}

// === CHAOS MODE ===

export function closeHub(state: EngineState, hubId?: string): { success: boolean; hub_name?: string; affected_count?: number; affected_shipments?: string[]; error?: { code: string; message: string } } {
  if (!hubId) {
    const active = state.hubs.filter(h => h.status === "ACTIVE");
    if (active.length === 0) return { success: false, error: { code: "NO_HUB", message: "No active hubs to close" } };
    hubId = state.rng.choice(active).id;
  }
  const hub = state.hubs_by_id[hubId];
  if (!hub) return { success: false, error: { code: "NOT_FOUND", message: `City ${hubId} not found` } };
  if (hub.status === "CLOSED") return { success: false, error: { code: "ALREADY_CLOSED", message: `${hub.name} is already closed` } };

  hub.status = "CLOSED";
  const affected: string[] = [];
  for (const s of state.shipments) {
    if (s.status === "DELIVERED" || s.status === "RECOVERED") continue;
    const v = s.assigned_vehicle_id ? state.vehicles_by_id[s.assigned_vehicle_id] : null;
    if (v && v.route_hub_sequence.includes(hubId)) {
      s.status = "DISRUPTED";
      affected.push(s.id);
    } else if (s.recovery_pickup_hub_id === hubId) {
      s.status = "MISPLACED";
      affected.push(s.id);
    }
  }
  for (const sid of affected) {
    const s = state.shipments_by_id[sid];
    if (s && s.status === "DISRUPTED") s.status = "MISPLACED";
  }
  addLog(state, "chaos", `${hub.name} closed. ${affected.length} packages need new plans.`, { hub_id: hubId, affected_count: affected.length });
  return { success: true, hub_name: hub.name, affected_count: affected.length, affected_shipments: affected };
}

// === FULL TICK (tick + detection + recovery check) ===

export function fullTick(state: EngineState) {
  if (state.running) {
    tick(state);
    runDetection(state);
    checkRecoveryCompletion(state);
    updateMetrics(state);
  }
}

export function resetEngine(state: EngineState): EngineState {
  return createEngine(state.config);
}

// === FALLBACK: TRANSMIT TO NEAREST NODE ===

function transmitToNearestNode(state: EngineState, s: Shipment): RecoveryOption | null {
  const destHub = state.hubs_by_id[s.destination_hub_id];
  if (!destHub) return null;

  const currentDistToDest = haversine_km(s.current_location.lat, s.current_location.lng, destHub.lat, destHub.lng);

  let bestHub: Hub | null = null;
  let bestScore = -Infinity;

  for (const h of state.hubs) {
    if (h.status !== "ACTIVE") continue;
    if (h.id === s.destination_hub_id) continue;
    const hubDistToDest = haversine_km(h.lat, h.lng, destHub.lat, destHub.lng);
    if (hubDistToDest >= currentDistToDest) continue;
    const distFromCurrent = haversine_km(s.current_location.lat, s.current_location.lng, h.lat, h.lng);
    const improvement = currentDistToDest - hubDistToDest;
    const score = improvement - distFromCurrent * 0.3;
    if (score > bestScore) { bestScore = score; bestHub = h; }
  }

  if (!bestHub) {
    const fallback = nearestHub(s.current_location, state.hubs, true);
    if (!fallback || fallback.id === s.destination_hub_id) return null;
    bestHub = fallback;
  }

  const distance = haversine_km(s.current_location.lat, s.current_location.lng, bestHub.lat, bestHub.lng);
  const transitSpeed = 50;
  const transitTime = distance / transitSpeed;
  const eta = state.sim_time_hours + transitTime;
  const cost = distance * state.config.dedicated_cost_per_km;
  const delay = eta - s.deadline;
  const co2 = distance * state.config.emission_factor;

  return {
    id: `OPT-${s.id}-FALLBACK`,
    shipment_id: s.id,
    rank: 0,
    strategy_label: "TRANSMIT TO NEAREST NODE",
    piggyback_mode: "REPOSITIONING",
    vehicle_ids: [],
    transfer_hub_ids: [bestHub.id],
    estimated_cost_usd: Math.round(cost * 100) / 100,
    dedicated_cost_usd: Math.round(cost * 100) / 100,
    cost_saved_usd: 0,
    estimated_delay_hours: Math.round(delay * 10) / 10,
    estimated_arrival: Math.round(eta * 10) / 10,
    co2_saved_kg: 0,
    utilization_gain: 0,
    score: 0,
    score_breakdown: { raw_values: {}, normalized_values: {}, weights: {}, weighted_contributions: {}, final_score: 0 },
    explanation: `No vehicles with available capacity were found on any route reaching the destination. This plan transmits the package to ${bestHub.name}, the nearest active hub closer to the destination, so it moves one step forward instead of remaining lost. From ${bestHub.name}, new recovery options can be generated as vehicles become available.`,
    feasible: true,
  };
}

// === OPTIMIZE (search + match + evaluate + decide) ===

export function optimize(state: EngineState, shipmentId: string, weights?: Record<string, number>): RecoveryOption[] {
  const ship = state.shipments_by_id[shipmentId];
  if (!ship || ship.status !== "MISPLACED") return [];
  const searchCands = runSearch(state);
  const matches = findCandidates(state, ship, searchCands);
  if (matches.length === 0) {
    const fallback = transmitToNearestNode(state, ship);
    if (fallback) {
      const fallbackOptions = [fallback];
      normalizeAndScore(fallbackOptions, ship, { ...DEFAULT_WEIGHTS, ...(weights || {}) });
      const ranked = decide(state, ship, fallbackOptions);
      state.recovery_options[shipmentId] = ranked;
      addLog(state, "optimize", `No standard rescue plans for ${shipmentId}. Generated fallback: transmit to ${state.hubs_by_id[fallback.transfer_hub_ids[0]]?.name || "nearest node"}`, { shipment_id: shipmentId });
      return ranked;
    }
    state.recovery_options[shipmentId] = [];
    addLog(state, "optimize", `No rescue plans available for ${shipmentId}`, { shipment_id: shipmentId });
    return [];
  }
  const options = evaluate(state, ship, matches, weights);
  const ranked = decide(state, ship, options);
  state.recovery_options[shipmentId] = ranked;
  addLog(state, "optimize", `Generated ${ranked.length} rescue plan(s) for ${shipmentId}`, { shipment_id: shipmentId });
  return ranked;
}

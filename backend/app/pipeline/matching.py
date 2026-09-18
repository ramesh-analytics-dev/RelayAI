"""Matching engine — four piggyback strategies for shipment recovery."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.models import (
    HubStatus,
    PiggybackMode,
    Shipment,
    Vehicle,
    VehicleStatus,
)
from app.simulation.geo import haversine_km

if TYPE_CHECKING:
    from app.services.state import AppState


class MatchingEngine:
    """Four-strategy matching: direct, consolidation, multi-hop, fallback repositioning."""

    def __init__(self, state: "AppState"):
        self.state = state

    def find_candidates(self, shipment: Shipment, search_candidates: list[dict]) -> list[dict]:
        """Return list of candidate match dicts with strategy info."""
        results: list[dict] = []
        state = self.state
        dest_hub = state.hubs_by_id.get(shipment.destination_hub_id)
        if dest_hub is None:
            return results

        for cand in search_candidates:
            v: Vehicle = cand["vehicle"]
            route = cand["route"]
            spare = cand["spare_capacity_kg"]

            # Strategy 1: Direct piggyback
            direct = self._try_direct(shipment, v, route, spare)
            if direct:
                results.append(direct)
                continue

            # Strategy 2: Consolidation
            consol = self._try_consolidation(shipment, v, route, spare)
            if consol:
                results.append(consol)

        # Strategy 3: Multi-hop
        multi = self._find_multi_hop(shipment, search_candidates)
        results.extend(multi)

        # Strategy 4: Fallback repositioning
        if not results:
            reposition = self._try_repositioning(shipment, search_candidates)
            results.extend(reposition)

        return results

    def _try_direct(self, s: Shipment, v: Vehicle, route, spare: float) -> dict | None:
        state = self.state
        pickup_id = s.recovery_pickup_hub_id
        dest_id = s.destination_hub_id

        if pickup_id is None:
            return None
        if pickup_id not in v.route_hub_sequence or dest_id not in v.route_hub_sequence:
            return None
        pi = v.route_hub_sequence.index(pickup_id)
        di = v.route_hub_sequence.index(dest_id)
        if pi >= di:
            return None
        if pi < v.current_leg_index:
            return None
        if spare < s.weight_kg:
            return None

        # Check deadline
        eta = self._eta_for_segment(v, pi, di)
        if eta > s.deadline:
            return None

        return {
            "strategy": PiggybackMode.DIRECT,
            "vehicle_ids": [v.id],
            "transfer_hub_ids": [],
            "pickup_hub_id": pickup_id,
            "destination_hub_id": dest_id,
            "vehicle": v,
            "route": route,
            "spare_capacity_kg": spare,
            "eta_hours": eta,
            "distance_km": self._segment_distance(v, pi, di),
        }

    def _try_consolidation(self, s: Shipment, v: Vehicle, route, spare: float) -> dict | None:
        state = self.state
        # Find another shipment already on this vehicle's leg going toward destination
        for other in state.shipments:
            if other.id == s.id:
                continue
            if other.assigned_vehicle_id != v.id:
                continue
            if other.destination_hub_id != s.destination_hub_id:
                continue
            # Both shipments go to same destination on same vehicle
            if spare < s.weight_kg:
                return None
            pickup_id = s.recovery_pickup_hub_id
            if pickup_id is None or pickup_id not in v.route_hub_sequence:
                return None
            if s.destination_hub_id not in v.route_hub_sequence:
                return None
            pi = v.route_hub_sequence.index(pickup_id)
            di = v.route_hub_sequence.index(s.destination_hub_id)
            if pi >= di or pi < v.current_leg_index:
                return None
            eta = self._eta_for_segment(v, pi, di)
            if eta > s.deadline:
                return None
            return {
                "strategy": PiggybackMode.CONSOLIDATION,
                "vehicle_ids": [v.id],
                "transfer_hub_ids": [],
                "pickup_hub_id": pickup_id,
                "destination_hub_id": s.destination_hub_id,
                "vehicle": v,
                "route": route,
                "spare_capacity_kg": spare,
                "eta_hours": eta,
                "distance_km": self._segment_distance(v, pi, di),
            }
        return None

    def _find_multi_hop(self, s: Shipment, search_candidates: list[dict]) -> list[dict]:
        state = self.state
        results: list[dict] = []
        pickup_id = s.recovery_pickup_hub_id
        dest_id = s.destination_hub_id
        if pickup_id is None:
            return results

        for cand_a in search_candidates:
            v_a: Vehicle = cand_a["vehicle"]
            if pickup_id not in v_a.route_hub_sequence:
                continue
            pi_a = v_a.route_hub_sequence.index(pickup_id)
            if pi_a < v_a.current_leg_index:
                continue
            if cand_a["spare_capacity_kg"] < s.weight_kg:
                continue

            for transfer_idx in range(pi_a + 1, len(v_a.route_hub_sequence)):
                transfer_id = v_a.route_hub_sequence[transfer_idx]
                transfer_hub = state.hubs_by_id.get(transfer_id)
                if transfer_hub is None or transfer_hub.status == HubStatus.CLOSED:
                    continue
                if transfer_id == dest_id:
                    continue

                for cand_b in search_candidates:
                    v_b: Vehicle = cand_b["vehicle"]
                    if v_b.id == v_a.id:
                        continue
                    if transfer_id not in v_b.route_hub_sequence:
                        continue
                    if dest_id not in v_b.route_hub_sequence:
                        continue
                    ti_b = v_b.route_hub_sequence.index(transfer_id)
                    di_b = v_b.route_hub_sequence.index(dest_id)
                    if ti_b >= di_b:
                        continue
                    if ti_b < v_b.current_leg_index:
                        continue
                    if cand_b["spare_capacity_kg"] < s.weight_kg:
                        continue

                    eta_a = self._eta_for_segment(v_a, pi_a, transfer_idx)
                    transfer_time = transfer_hub.transfer_time_hours
                    eta_b = self._eta_for_segment(v_b, ti_b, di_b)
                    total_eta = eta_a + transfer_time + eta_b
                    if total_eta > s.deadline:
                        continue

                    dist_a = self._segment_distance(v_a, pi_a, transfer_idx)
                    dist_b = self._segment_distance(v_b, ti_b, di_b)

                    results.append({
                        "strategy": PiggybackMode.MULTI_HOP,
                        "vehicle_ids": [v_a.id, v_b.id],
                        "transfer_hub_ids": [transfer_id],
                        "pickup_hub_id": pickup_id,
                        "destination_hub_id": dest_id,
                        "vehicle": v_a,
                        "vehicle_b": v_b,
                        "route": cand_a["route"],
                        "spare_capacity_kg": min(cand_a["spare_capacity_kg"], cand_b["spare_capacity_kg"]),
                        "eta_hours": total_eta,
                        "distance_km": dist_a + dist_b,
                        "transfer_time_hours": transfer_time,
                    })
                    if len(results) >= 10:
                        return results
        return results

    def _try_repositioning(self, s: Shipment, search_candidates: list[dict]) -> list[dict]:
        state = self.state
        pickup_id = s.recovery_pickup_hub_id
        dest_id = s.destination_hub_id
        if pickup_id is None:
            return []
        pickup_hub = state.hubs_by_id.get(pickup_id)
        if pickup_hub is None:
            return []

        # Find nearest active hub with outbound coverage toward destination
        best_hub = None
        best_dist = float("inf")
        for h in state.hubs:
            if h.status == HubStatus.CLOSED:
                continue
            if h.id == pickup_id:
                continue
            d = haversine_km(pickup_hub.lat, pickup_hub.lng, h.lat, h.lng)
            if d < best_dist:
                best_dist = d
                best_hub = h

        if best_hub is None:
            return []

        # Now try to find a vehicle from best_hub toward destination
        for cand in search_candidates:
            v: Vehicle = cand["vehicle"]
            if best_hub.id not in v.route_hub_sequence or dest_id not in v.route_hub_sequence:
                continue
            hi = v.route_hub_sequence.index(best_hub.id)
            di = v.route_hub_sequence.index(dest_id)
            if hi >= di or hi < v.current_leg_index:
                continue
            if cand["spare_capacity_kg"] < s.weight_kg:
                continue
            eta = self._eta_for_segment(v, hi, di) + best_dist / 50  # add repositioning travel
            if eta > s.deadline:
                continue
            return [{
                "strategy": PiggybackMode.REPOSITIONING,
                "vehicle_ids": [v.id],
                "transfer_hub_ids": [best_hub.id],
                "pickup_hub_id": best_hub.id,
                "destination_hub_id": dest_id,
                "vehicle": v,
                "route": cand["route"],
                "spare_capacity_kg": cand["spare_capacity_kg"],
                "eta_hours": eta,
                "distance_km": self._segment_distance(v, hi, di) + best_dist,
            }]
        return []

    def _eta_for_segment(self, v: Vehicle, from_idx: int, to_idx: int) -> float:
        """Calculate ETA in sim hours for a vehicle to travel from one hub index to another."""
        state = self.state
        total = 0.0
        for i in range(from_idx, to_idx):
            leg = None
            route = state.routes_by_id.get(v.route_id)
            if route and i < len(route.legs):
                leg = route.legs[i]
            if leg:
                dist = leg.distance_km
            else:
                h_from = state.hubs_by_id.get(v.route_hub_sequence[i])
                h_to = state.hubs_by_id.get(v.route_hub_sequence[i + 1])
                if h_from and h_to:
                    dist = haversine_km(h_from.lat, h_from.lng, h_to.lat, h_to.lng)
                else:
                    dist = 0
            if i == v.current_leg_index:
                remaining = dist - v.progress_on_leg_km
                total += max(0, remaining) / v.speed_kmh
            else:
                total += dist / v.speed_kmh
        return total + state.sim_time_hours

    def _segment_distance(self, v: Vehicle, from_idx: int, to_idx: int) -> float:
        state = self.state
        total = 0.0
        for i in range(from_idx, to_idx):
            route = state.routes_by_id.get(v.route_id)
            if route and i < len(route.legs):
                total += route.legs[i].distance_km
            else:
                h_from = state.hubs_by_id.get(v.route_hub_sequence[i])
                h_to = state.hubs_by_id.get(v.route_hub_sequence[i + 1])
                if h_from and h_to:
                    total += haversine_km(h_from.lat, h_from.lng, h_to.lat, h_to.lng)
        return total

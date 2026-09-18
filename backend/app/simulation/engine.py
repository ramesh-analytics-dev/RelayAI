"""Simulation tick loop engine for RelayAI."""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

from app.models import (
    AssignmentStatus,
    GeoPoint,
    HubStatus,
    ShipmentStatus,
    VehicleStatus,
)
from app.simulation.geo import haversine_km, interpolate_on_leg

if TYPE_CHECKING:
    from app.services.state import AppState


class SimulationEngine:
    """Advances the simulation by one tick each call."""

    def __init__(self, state: "AppState"):
        self.state = state
        self.rng: random.Random = state.rng

    def tick(self) -> None:
        """Execute one simulation tick."""
        state = self.state
        state.tick += 1
        dt_hours = state.config.tick_hours * state.speed_multiplier
        state.sim_time_hours += dt_hours

        self._advance_vehicles(dt_hours)
        self._update_shipment_positions(dt_hours)
        self._complete_legs_and_assignments()
        self._induce_anomalies(dt_hours)

    def _advance_vehicles(self, dt_hours: float) -> None:
        state = self.state
        hubs_by_id = state.hubs_by_id
        for v in state.vehicles:
            if v.status == VehicleStatus.COMPLETED:
                continue
            remaining = v.speed_kmh * dt_hours
            while remaining > 0 and v.current_leg_index < len(v.route_hub_sequence) - 1:
                leg = state.route_legs_by_vehicle.get(v.id)
                if leg is None:
                    h_from = hubs_by_id.get(v.route_hub_sequence[v.current_leg_index])
                    h_to = hubs_by_id.get(v.route_hub_sequence[v.current_leg_index + 1])
                    if h_from and h_to:
                        leg_dist = haversine_km(h_from.lat, h_from.lng, h_to.lat, h_to.lng)
                    else:
                        leg_dist = 0
                else:
                    leg_dist = leg.distance_km
                remaining_on_leg = leg_dist - v.progress_on_leg_km
                if remaining < remaining_on_leg:
                    v.progress_on_leg_km += remaining
                    remaining = 0
                    frac = v.progress_on_leg_km / leg_dist if leg_dist > 0 else 1.0
                    h_from = hubs_by_id.get(v.route_hub_sequence[v.current_leg_index])
                    h_to = hubs_by_id.get(v.route_hub_sequence[v.current_leg_index + 1])
                    if h_from and h_to:
                        v.current_position = interpolate_on_leg(
                            GeoPoint(lat=h_from.lat, lng=h_from.lng),
                            GeoPoint(lat=h_to.lat, lng=h_to.lng),
                            frac,
                        )
                    v.status = VehicleStatus.IN_TRANSIT
                else:
                    v.progress_on_leg_km = 0.0
                    v.current_leg_index += 1
                    remaining -= remaining_on_leg
                    if v.current_leg_index >= len(v.route_hub_sequence) - 1:
                        last_hub = hubs_by_id.get(v.route_hub_sequence[-1])
                        if last_hub:
                            v.current_position = GeoPoint(lat=last_hub.lat, lng=last_hub.lng)
                        v.status = VehicleStatus.AT_HUB
                        break
                    else:
                        next_hub = hubs_by_id.get(v.route_hub_sequence[v.current_leg_index])
                        if next_hub:
                            v.current_position = GeoPoint(lat=next_hub.lat, lng=next_hub.lng)
                        v.status = VehicleStatus.AT_HUB

    def _update_shipment_positions(self, dt_hours: float) -> None:
        state = self.state
        hubs_by_id = state.hubs_by_id
        for s in state.shipments:
            if s.status not in (ShipmentStatus.IN_TRANSIT, ShipmentStatus.RECOVERING):
                continue
            v = state.vehicles_by_id.get(s.assigned_vehicle_id) if s.assigned_vehicle_id else None
            if v and v.status in (VehicleStatus.IN_TRANSIT,):
                s.current_location = GeoPoint(lat=v.current_position.lat, lng=v.current_position.lng)
            if s.status == ShipmentStatus.IN_TRANSIT:
                s.last_scan_event_at = state.sim_time_hours

    def _complete_legs_and_assignments(self) -> None:
        state = self.state
        hubs_by_id = state.hubs_by_id
        for a in state.assignments:
            if a.status != AssignmentStatus.IN_TRANSIT:
                continue
            v = state.vehicles_by_id.get(a.vehicle_id)
            if v is None:
                continue
            if v.current_leg_index > a.leg_index or v.status == VehicleStatus.AT_HUB:
                a.actual_arrival = state.sim_time_hours
                a.status = AssignmentStatus.COMPLETED
                ship = state.shipments_by_id.get(a.shipment_id)
                if ship:
                    to_hub = hubs_by_id.get(a.to_hub_id)
                    if to_hub:
                        ship.current_location = GeoPoint(lat=to_hub.lat, lng=to_hub.lng)
                    ship.last_scan_event_at = state.sim_time_hours
                    if a.to_hub_id == ship.destination_hub_id:
                        ship.status = ShipmentStatus.DELIVERED
                        v.used_capacity_kg = max(0, v.used_capacity_kg - ship.weight_kg)
                    elif ship.status == ShipmentStatus.RECOVERING:
                        ship.status = ShipmentStatus.RECOVERED

    def _induce_anomalies(self, dt_hours: float) -> None:
        """Naturally induce anomalies in ~2% of in-transit shipments."""
        state = self.state
        in_transit = [s for s in state.shipments if s.status == ShipmentStatus.IN_TRANSIT]
        if not in_transit:
            return
        for s in in_transit:
            if self.rng.random() > state.config.misplacement_rate * dt_hours:
                continue
            scenario = self.rng.choice(["A", "B", "C"])
            if scenario == "A":
                s.last_scan_event_at = state.sim_time_hours - state.config.stale_scan_hours - self.rng.uniform(1, 5)
            elif scenario == "B":
                jitter_lat = self.rng.uniform(-2, 2)
                jitter_lng = self.rng.uniform(-2, 2)
                s.current_location = GeoPoint(
                    lat=s.current_location.lat + jitter_lat,
                    lng=s.current_location.lng + jitter_lng,
                )
            elif scenario == "C":
                v = state.vehicles_by_id.get(s.assigned_vehicle_id) if s.assigned_vehicle_id else None
                if v and v.current_leg_index > s.current_leg_index:
                    s.last_scan_event_at = state.sim_time_hours - state.config.stale_scan_hours - self.rng.uniform(1, 3)
                else:
                    s.last_scan_event_at = state.sim_time_hours - state.config.stale_scan_hours - self.rng.uniform(1, 3)

"""Detection engine — identifies misplaced shipments using three rules."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.models import RecoveryEvent, RecoveryEventStatus, Severity, ShipmentStatus
from app.simulation.geo import min_distance_to_route_km, nearest_hub

if TYPE_CHECKING:
    from app.services.state import AppState


class DetectionEngine:
    """Three-rule detection: stale scan, route deviation, missed connection."""

    def __init__(self, state: "AppState"):
        self.state = state

    def run(self) -> list[RecoveryEvent]:
        state = self.state
        new_events: list[RecoveryEvent] = []
        skip = {ShipmentStatus.MISPLACED, ShipmentStatus.RECOVERING, ShipmentStatus.RECOVERED, ShipmentStatus.DELIVERED, ShipmentStatus.DISRUPTED}

        for s in state.shipments:
            if s.status in skip:
                continue
            if s.status != ShipmentStatus.IN_TRANSIT:
                continue

            reason, severity = self._check(s)
            if reason is None:
                continue

            pickup = nearest_hub(s.current_location, state.hubs, active_only=True)
            s.recovery_pickup_hub_id = pickup.id if pickup else None
            s.status = ShipmentStatus.MISPLACED

            evt = RecoveryEvent(
                id=f"EVT-{s.id}-{state.tick}",
                shipment_id=s.id,
                detected_at=state.sim_time_hours,
                detection_reason=reason,
                severity=severity,
                status=RecoveryEventStatus.DETECTED,
            )
            state.events.append(evt)
            new_events.append(evt)
            state.add_log(
                "detection",
                f"Package {s.id} flagged as lost: {reason}",
                shipment_id=s.id,
                severity=severity.value,
            )

        return new_events

    def _check(self, s) -> tuple[str | None, Severity]:
        state = self.state
        # Rule 1: Stale scan
        scan_age = state.sim_time_hours - s.last_scan_event_at
        if scan_age > state.config.stale_scan_hours:
            return (
                f"Stale scan: last scan {scan_age:.1f}h ago (threshold {state.config.stale_scan_hours}h)",
                Severity.MEDIUM,
            )

        # Rule 2: Route deviation
        route = state.routes_by_id.get(s.planned_route_id) if s.planned_route_id else None
        if route is None and s.assigned_vehicle_id:
            v = state.vehicles_by_id.get(s.assigned_vehicle_id)
            if v:
                route = state.routes_by_id.get(v.route_id)
        if route:
            dist = min_distance_to_route_km(s.current_location, route, state.hubs_by_id)
            if dist > state.config.route_deviation_km:
                return (
                    f"Route deviation: {dist:.1f}km from planned route (threshold {state.config.route_deviation_km}km)",
                    Severity.HIGH,
                )

        # Rule 3: Missed connection
        if s.assigned_vehicle_id:
            v = state.vehicles_by_id.get(s.assigned_vehicle_id)
            if v and v.current_leg_index > s.current_leg_index:
                next_hub_id = v.route_hub_sequence[s.current_leg_index + 1] if s.current_leg_index + 1 < len(v.route_hub_sequence) else None
                if next_hub_id:
                    scan_gap = state.sim_time_hours - s.last_scan_event_at
                    if scan_gap > state.config.missed_connection_buffer_hours:
                        v_short = v.id.replace("V-", "V")
                        return (
                            f"Missed connection: vehicle {v_short} completed leg but package was not scanned at next hub",
                            Severity.HIGH,
                        )

        return None, Severity.MEDIUM

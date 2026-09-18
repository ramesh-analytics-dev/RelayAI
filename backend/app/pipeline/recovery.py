"""Recovery engine — executes chosen recovery plan with full validation."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.models import (
    AssignmentStatus,
    RecoveryEventStatus,
    ShipmentAssignment,
    ShipmentStatus,
    VehicleStatus,
)

if TYPE_CHECKING:
    from app.services.state import AppState


class RecoveryEngine:
    """Validates and executes recovery plans."""

    def __init__(self, state: "AppState"):
        self.state = state

    def recover(self, shipment_id: str, option_rank: int) -> dict:
        state = self.state
        ship = state.shipments_by_id.get(shipment_id)
        if ship is None:
            return {"success": False, "error": {"code": "NOT_FOUND", "message": f"Package {shipment_id} not found"}}

        if ship.status != ShipmentStatus.MISPLACED:
            return {"success": False, "error": {"code": "RECOVERY_CONFLICT", "message": "This package is no longer available for recovery."}}

        options = state.recovery_options.get(shipment_id, [])
        chosen = None
        for opt in options:
            if opt.rank == option_rank:
                chosen = opt
                break
        if chosen is None:
            return {"success": False, "error": {"code": "INVALID_OPTION", "message": f"Rescue plan #{option_rank} not found"}}

        # Revalidate capacity
        for vid in chosen.vehicle_ids:
            v = state.vehicles_by_id.get(vid)
            if v is None:
                return {"success": False, "error": {"code": "RECOVERY_CONFLICT", "message": "Vehicle no longer available"}}
            if v.spare_capacity_kg < ship.weight_kg:
                return {"success": False, "error": {"code": "CAPACITY_CONFLICT", "message": "Vehicle no longer has enough space"}}

        # Revalidate closed hubs
        for hid in chosen.transfer_hub_ids:
            h = state.hubs_by_id.get(hid)
            if h and h.status.value == "CLOSED":
                return {"success": False, "error": {"code": "HUB_CLOSED", "message": "Transfer stop is closed"}}

        # Revalidate deadline
        if chosen.estimated_arrival > ship.deadline:
            return {"success": False, "error": {"code": "DEADLINE_MISSED", "message": "This plan no longer meets the deadline"}}

        # Cancel original assignment
        for a in state.assignments:
            if a.shipment_id == shipment_id and a.status in (AssignmentStatus.PENDING, AssignmentStatus.IN_TRANSIT):
                a.status = AssignmentStatus.CANCELLED

        # Create recovery assignment
        v = state.vehicles_by_id.get(chosen.vehicle_ids[0])
        if v:
            v.used_capacity_kg += ship.weight_kg
            pickup_id = chosen.transfer_hub_ids[0] if chosen.transfer_hub_ids else ship.recovery_pickup_hub_id
            if pickup_id and pickup_id in v.route_hub_sequence:
                leg_idx = v.route_hub_sequence.index(pickup_id)
            else:
                leg_idx = v.current_leg_index
            dest_id = chosen.transfer_hub_ids[-1] if len(chosen.transfer_hub_ids) > 1 else ship.destination_hub_id
            state.assignments.append(
                ShipmentAssignment(
                    id=f"REC-{shipment_id}-{state.tick}",
                    shipment_id=shipment_id,
                    vehicle_id=chosen.vehicle_ids[0],
                    leg_index=leg_idx,
                    from_hub_id=pickup_id or "",
                    to_hub_id=dest_id,
                    scheduled_departure=state.sim_time_hours,
                    scheduled_arrival=chosen.estimated_arrival,
                    status=AssignmentStatus.IN_TRANSIT,
                )
            )
            ship.assigned_vehicle_id = chosen.vehicle_ids[0]
            ship.current_leg_index = leg_idx
            pickup_hub = state.hubs_by_id.get(pickup_id)
            if pickup_hub:
                ship.current_location.lat = pickup_hub.lat
                ship.current_location.lng = pickup_hub.lng

        ship.status = ShipmentStatus.RECOVERING
        ship.recovery_option_id = chosen.id

        # Update recovery event
        for evt in reversed(state.events):
            if evt.shipment_id == shipment_id and evt.status == RecoveryEventStatus.DETECTED:
                evt.status = RecoveryEventStatus.RECOVERY_CHOSEN
                evt.chosen_option = chosen.id
                break

        # Update metrics
        state.metrics.money_saved_usd += chosen.cost_saved_usd
        state.metrics.co2_saved_kg += chosen.co2_saved_kg
        state.metrics.packages_rescued += 1
        if chosen.estimated_delay_hours < 0:
            state.metrics.time_saved_hours += abs(chosen.estimated_delay_hours)
        state.metrics.space_used_pct += chosen.utilization_gain * 100

        state.add_log(
            "recovery",
            f"Package {shipment_id} rescue plan chosen: {chosen.strategy_label}. "
            f"${chosen.cost_saved_usd:.0f} saved, {chosen.co2_saved_kg:.1f}kg CO2 saved",
            shipment_id=shipment_id,
        )

        return {"success": True, "shipment_id": shipment_id, "option": chosen.model_dump()}

    def check_recovery_completion(self) -> None:
        """Check if recovering shipments have reached their destination."""
        state = self.state
        for s in state.shipments:
            if s.status != ShipmentStatus.RECOVERING:
                continue
            v = state.vehicles_by_id.get(s.assigned_vehicle_id) if s.assigned_vehicle_id else None
            if v is None:
                continue
            dest_hub = state.hubs_by_id.get(s.destination_hub_id)
            if dest_hub is None:
                continue
            if v.current_leg_index >= len(v.route_hub_sequence) - 1:
                last_hub_id = v.route_hub_sequence[-1]
                if last_hub_id == s.destination_hub_id:
                    s.status = ShipmentStatus.RECOVERED
                    v.used_capacity_kg = max(0, v.used_capacity_kg - s.weight_kg)
                    state.metrics.total_recovered += 1
                    state.add_log("recovery", f"Package {s.id} rescued and delivered", shipment_id=s.id)

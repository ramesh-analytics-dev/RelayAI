"""Search engine — finds candidate vehicles with spare capacity."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.models import HubStatus, VehicleStatus

if TYPE_CHECKING:
    from app.services.state import AppState


class SearchEngine:
    """Finds all vehicles with spare capacity on valid routes."""

    def __init__(self, state: "AppState"):
        self.state = state

    def run(self) -> list[dict]:
        """Return list of candidate vehicle dicts with route and spare capacity info."""
        state = self.state
        candidates: list[dict] = []
        for v in state.vehicles:
            if v.status == VehicleStatus.COMPLETED:
                continue
            spare = v.spare_capacity_kg
            if spare <= 0:
                continue
            # Exclude routes containing CLOSED hubs
            route_has_closed = False
            for hid in v.route_hub_sequence:
                h = state.hubs_by_id.get(hid)
                if h and h.status == HubStatus.CLOSED:
                    route_has_closed = True
                    break
            if route_has_closed:
                continue
            route = state.routes_by_id.get(v.route_id)
            if route is None:
                continue
            candidates.append(
                {
                    "vehicle": v,
                    "route": route,
                    "current_position": v.current_position,
                    "spare_capacity_kg": spare,
                }
            )
        return candidates

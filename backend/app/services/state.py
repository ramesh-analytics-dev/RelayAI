"""Central application state manager for RelayAI."""

from __future__ import annotations

import random
from typing import Optional

from app.config import SimulationConfig
from app.models import (
    Hub,
    Metrics,
    RecoveryEvent,
    RecoveryOption,
    Route,
    RouteLeg,
    Shipment,
    ShipmentAssignment,
    ShipmentStatus,
    Vehicle,
)
from app.simulation.generator import generate_simulation


class AppState:
    """Holds all simulation state and provides lookup indexes."""

    def __init__(self, config: Optional[SimulationConfig] = None):
        self.config = config or SimulationConfig()
        self.rng: random.Random = random.Random(self.config.seed)
        self.tick: int = 0
        self.sim_time_hours: float = 0.0
        self.running: bool = True
        self.speed_multiplier: float = 1.0

        data = generate_simulation(self.config)
        self.hubs: list[Hub] = data["hubs"]
        self.routes: list[Route] = data["routes"]
        self.vehicles: list[Vehicle] = data["vehicles"]
        self.shipments: list[Shipment] = data["shipments"]
        self.assignments: list[ShipmentAssignment] = data["assignments"]
        self.rng: random.Random = data["rng"]

        self.events: list[RecoveryEvent] = []
        self.recovery_options: dict[str, list[RecoveryOption]] = {}
        self.metrics: Metrics = Metrics()
        self.event_log: list[dict] = []

        self._rebuild_indexes()

    def _rebuild_indexes(self) -> None:
        self.hubs_by_id: dict[str, Hub] = {h.id: h for h in self.hubs}
        self.vehicles_by_id: dict[str, Vehicle] = {v.id: v for v in self.vehicles}
        self.shipments_by_id: dict[str, Shipment] = {s.id: s for s in self.shipments}
        self.routes_by_id: dict[str, Route] = {r.id: r for r in self.routes}
        self.route_legs_by_vehicle: dict[str, RouteLeg] = {}  # type: ignore
        for v in self.vehicles:
            route = self.routes_by_id.get(v.route_id)
            if route and v.current_leg_index < len(route.legs):
                self.route_legs_by_vehicle[v.id] = route.legs[v.current_leg_index]

    def add_log(self, event_type: str, message: str, **extra) -> None:
        self.event_log.append(
            {
                "tick": self.tick,
                "sim_time": round(self.sim_time_hours, 1),
                "type": event_type,
                "message": message,
                **extra,
            }
        )
        if len(self.event_log) > 500:
            self.event_log = self.event_log[-500:]

    def update_metrics(self) -> None:
        counts = {s.value: 0 for s in ShipmentStatus}
        for s in self.shipments:
            counts[s.status.value] = counts.get(s.status.value, 0) + 1
        self.metrics.total_in_transit = counts.get(ShipmentStatus.IN_TRANSIT.value, 0)
        self.metrics.total_lost = counts.get(ShipmentStatus.MISPLACED.value, 0)
        self.metrics.total_recovering = counts.get(ShipmentStatus.RECOVERING.value, 0)
        self.metrics.total_recovered = counts.get(ShipmentStatus.RECOVERED.value, 0)
        self.metrics.total_delivered = counts.get(ShipmentStatus.DELIVERED.value, 0)
        self.metrics.total_disrupted = counts.get(ShipmentStatus.DISRUPTED.value, 0)

    def get_state_snapshot(self) -> dict:
        """Return a JSON-serializable snapshot of the full state."""
        self.update_metrics()
        return {
            "tick": self.tick,
            "sim_time_hours": round(self.sim_time_hours, 1),
            "running": self.running,
            "speed_multiplier": self.speed_multiplier,
            "hubs": [h.model_dump() for h in self.hubs],
            "vehicles": [v.model_dump() for v in self.vehicles],
            "shipments": [s.model_dump() for s in self.shipments],
            "routes": [r.model_dump() for r in self.routes],
            "assignments": [a.model_dump() for a in self.assignments],
            "events": [e.model_dump() for e in self.events[-50:]],
            "metrics": self.metrics.model_dump(),
            "event_log": self.event_log[-100:],
        }

    def reset(self) -> None:
        """Reset simulation to initial state."""
        self.rng = random.Random(self.config.seed)
        self.tick = 0
        self.sim_time_hours = 0.0
        self.running = True
        self.speed_multiplier = 1.0
        data = generate_simulation(self.config)
        self.hubs = data["hubs"]
        self.routes = data["routes"]
        self.vehicles = data["vehicles"]
        self.shipments = data["shipments"]
        self.assignments = data["assignments"]
        self.rng = data["rng"]
        self.events = []
        self.recovery_options = {}
        self.metrics = Metrics()
        self.event_log = []
        self._rebuild_indexes()


# Global singleton
_state: Optional[AppState] = None


def get_state() -> AppState:
    global _state
    if _state is None:
        _state = AppState()
    return _state


def reset_state() -> AppState:
    global _state
    _state = AppState()
    return _state

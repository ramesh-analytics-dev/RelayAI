"""Deterministic simulation data generator for RelayAI."""

from __future__ import annotations

import random
from typing import Optional

from app.config import SimulationConfig
from app.models import (
    AssignmentStatus,
    GeoPoint,
    Hub,
    HubStatus,
    Route,
    RouteLeg,
    Shipment,
    ShipmentAssignment,
    ShipmentStatus,
    Vehicle,
    VehicleType,
)
from app.simulation.geo import haversine_km


def generate_hubs(rng: random.Random, config: SimulationConfig) -> list[Hub]:
    from app.config import INDIAN_CITIES

    hubs: list[Hub] = []
    for i in range(config.num_hubs):
        name = INDIAN_CITIES[i % len(INDIAN_CITIES)]
        if i >= len(INDIAN_CITIES):
            name = f"{name}-{i}"
        lat = config.hub_center[0] + rng.uniform(-config.hub_jitter, config.hub_jitter)
        lng = config.hub_center[1] + rng.uniform(-config.hub_jitter, config.hub_jitter)
        transfer_time = round(rng.uniform(1.0, 4.0), 1)
        handling_cost = round(rng.uniform(0.2, 1.0), 2)
        hubs.append(
            Hub(
                id=f"H-{i+1:02d}",
                name=name,
                lat=round(lat, 4),
                lng=round(lng, 4),
                status=HubStatus.ACTIVE,
                transfer_time_hours=transfer_time,
                handling_cost_per_kg=handling_cost,
            )
        )
    return hubs


def generate_routes(rng: random.Random, hubs: list[Hub], num_routes: int) -> list[Route]:
    routes: list[Route] = []
    for i in range(num_routes):
        num_hops = rng.randint(2, 5)
        chosen: list[str] = []
        attempts = 0
        while len(chosen) < num_hops and attempts < 50:
            h = rng.choice(hubs)
            if h.id not in chosen:
                chosen.append(h.id)
            attempts += 1
        legs: list[RouteLeg] = []
        for j in range(len(chosen) - 1):
            h_from = next(h for h in hubs if h.id == chosen[j])
            h_to = next(h for h in hubs if h.id == chosen[j + 1])
            dist = haversine_km(h_from.lat, h_from.lng, h_to.lat, h_to.lng)
            legs.append(RouteLeg(from_hub_id=chosen[j], to_hub_id=chosen[j + 1], distance_km=round(dist, 1)))
        routes.append(Route(id=f"R-{i+1:04d}", hub_sequence=chosen, legs=legs))
    return routes


def generate_vehicles(
    rng: random.Random, routes: list[Route], hubs: list[Hub], config: SimulationConfig
) -> list[Vehicle]:
    from app.config import VEHICLE_CAPACITY_RANGE, VEHICLE_COST_PER_KM, VEHICLE_SPEEDS, VEHICLE_TYPE_WEIGHTS

    vehicles: list[Vehicle] = []
    for i in range(config.num_vehicles):
        route = routes[i % len(routes)]
        vtype_str = rng.choices(
            list(VEHICLE_TYPE_WEIGHTS.keys()),
            weights=list(VEHICLE_TYPE_WEIGHTS.values()),
        )[0]
        vtype = VehicleType(vtype_str)
        cap_min, cap_max = VEHICLE_CAPACITY_RANGE[vtype_str]
        total_cap = rng.randint(cap_min, cap_max)
        used_pct = rng.uniform(0.0, 0.7)
        used_cap = round(total_cap * used_pct, 1)
        cost_per_km = VEHICLE_COST_PER_KM[vtype_str] * rng.uniform(0.8, 1.2)
        speed = VEHICLE_SPEEDS[vtype_str]
        leg_idx = rng.randint(0, max(0, len(route.legs) - 1))
        progress = rng.uniform(0, route.legs[leg_idx].distance_km if route.legs else 0)
        first_hub = next((h for h in hubs if h.id == route.hub_sequence[0]), hubs[0])
        vehicles.append(
            Vehicle(
                id=f"V-{i+1:04d}",
                type=vtype,
                route_hub_sequence=route.hub_sequence,
                current_position=GeoPoint(lat=first_hub.lat, lng=first_hub.lng),
                current_leg_index=leg_idx,
                progress_on_leg_km=round(progress, 1),
                total_capacity_kg=total_cap,
                used_capacity_kg=used_cap,
                cost_per_km=round(cost_per_km, 2),
                speed_kmh=speed,
                route_id=route.id,
            )
        )
    return vehicles


def generate_shipments(
    rng: random.Random, hubs: list[Hub], vehicles: list[Vehicle], config: SimulationConfig
) -> tuple[list[Shipment], list[ShipmentAssignment]]:
    from app.config import PRIORITY_DISTRIBUTION

    shipments: list[Shipment] = []
    assignments: list[ShipmentAssignment] = []
    for i in range(config.num_shipments):
        origin = rng.choice(hubs)
        dest = rng.choice(hubs)
        while dest.id == origin.id:
            dest = rng.choice(hubs)
        weight = round(rng.uniform(10, 200), 1)
        deadline = rng.uniform(6, 72)
        priority = rng.choices(
            list(PRIORITY_DISTRIBUTION.keys()),
            weights=list(PRIORITY_DISTRIBUTION.values()),
        )[0]
        value = round(weight * rng.uniform(10, 50), 2)
        vehicle = rng.choice(vehicles)
        leg_idx = rng.randint(0, max(0, len(vehicle.route_hub_sequence) - 2))
        from_hub_id = vehicle.route_hub_sequence[leg_idx]
        to_hub_id = vehicle.route_hub_sequence[leg_idx + 1] if leg_idx + 1 < len(vehicle.route_hub_sequence) else vehicle.route_hub_sequence[-1]
        from_hub = next(h for h in hubs if h.id == from_hub_id)
        ship = Shipment(
            id=f"SHP-{i+1:04d}",
            origin_hub_id=origin.id,
            destination_hub_id=dest.id,
            current_location=GeoPoint(lat=from_hub.lat, lng=from_hub.lng),
            deadline=round(deadline, 1),
            priority=priority,
            weight_kg=weight,
            value_usd=value,
            status=ShipmentStatus.IN_TRANSIT,
            last_scan_event_at=0.0,
            assigned_vehicle_id=vehicle.id,
            current_leg_index=leg_idx,
        )
        shipments.append(ship)
        assignments.append(
            ShipmentAssignment(
                id=f"A-{i+1:04d}",
                shipment_id=ship.id,
                vehicle_id=vehicle.id,
                leg_index=leg_idx,
                from_hub_id=from_hub_id,
                to_hub_id=to_hub_id,
                scheduled_departure=0.0,
                scheduled_arrival=round(deadline * 0.5, 1),
                status=AssignmentStatus.IN_TRANSIT,
            )
        )
    return shipments, assignments


def generate_simulation(config: Optional[SimulationConfig] = None) -> dict:
    """Generate the complete initial simulation state."""
    if config is None:
        config = SimulationConfig()
    rng = random.Random(config.seed)
    hubs = generate_hubs(rng, config)
    routes = generate_routes(rng, hubs, max(config.num_vehicles, 20))
    vehicles = generate_vehicles(rng, routes, hubs, config)
    shipments, assignments = generate_shipments(rng, hubs, vehicles, config)
    return {
        "hubs": hubs,
        "routes": routes,
        "vehicles": vehicles,
        "shipments": shipments,
        "assignments": assignments,
        "rng": rng,
    }

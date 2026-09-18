"""Central configuration for RelayAI simulation."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional


SIM_SEED = 42

NUM_HUBS = 20
NUM_VEHICLES = 30
NUM_SHIPMENTS = 100

HUB_CENTER = (28.0, 77.0)
HUB_JITTER = 1.5

STALE_SCAN_HOURS = 8
ROUTE_DEVIATION_KM = 50
MISSED_CONNECTION_BUFFER_HOURS = 1
DELAY_TOLERANCE_BUFFER_HOURS = 0

DEDICATED_COST_PER_KM = 2.5
EMISSION_FACTOR = 0.05
PIGGYBACK_EMISSION_FRACTION = 0.10

TICK_SECONDS = 1
TICK_HOURS = 1
MISPLACEMENT_RATE = 0.02

DEFAULT_WEIGHTS = {
    "w_cost": 0.30,
    "w_time": 0.25,
    "w_util": 0.20,
    "w_priority": 0.15,
    "w_co2": 0.10,
}

PRIORITY_WEIGHTS = {
    "PLATINUM": 1.0,
    "GOLD": 0.75,
    "SILVER": 0.5,
    "STANDARD": 0.25,
}

VEHICLE_SPEEDS = {
    "TRUCK": 60,
    "VAN": 50,
    "RAIL": 80,
    "AIR": 600,
}

VEHICLE_COST_PER_KM = {
    "TRUCK": 1.2,
    "VAN": 0.8,
    "RAIL": 0.5,
    "AIR": 5.0,
}

VEHICLE_CAPACITY_RANGE = {
    "TRUCK": (500, 2000),
    "VAN": (200, 800),
    "RAIL": (2000, 10000),
    "AIR": (100, 500),
}

VEHICLE_TYPE_WEIGHTS = {
    "TRUCK": 0.5,
    "VAN": 0.25,
    "RAIL": 0.15,
    "AIR": 0.10,
}

PRIORITY_DISTRIBUTION = {
    "PLATINUM": 0.10,
    "GOLD": 0.20,
    "SILVER": 0.30,
    "STANDARD": 0.40,
}

INDIAN_CITIES = [
    "Delhi", "Mumbai", "Bangalore", "Chennai", "Kolkata",
    "Hyderabad", "Pune", "Ahmedabad", "Jaipur", "Lucknow",
    "Kanpur", "Nagpur", "Indore", "Bhopal", "Patna",
    "Surat", "Vadodara", "Ghaziabad", "Ludhiana", "Agra",
]

# Runtime
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")


@dataclass
class SimulationConfig:
    seed: int = SIM_SEED
    num_hubs: int = NUM_HUBS
    num_vehicles: int = NUM_VEHICLES
    num_shipments: int = NUM_SHIPMENTS
    hub_center: tuple = HUB_CENTER
    hub_jitter: float = HUB_JITTER
    tick_hours: float = TICK_HOURS
    misplacement_rate: float = MISPLACEMENT_RATE
    stale_scan_hours: float = STALE_SCAN_HOURS
    route_deviation_km: float = ROUTE_DEVIATION_KM
    missed_connection_buffer_hours: float = MISSED_CONNECTION_BUFFER_HOURS
    delay_tolerance_buffer_hours: float = DELAY_TOLERANCE_BUFFER_HOURS
    dedicated_cost_per_km: float = DEDICATED_COST_PER_KM
    emission_factor: float = EMISSION_FACTOR
    piggyback_emission_fraction: float = PIGGYBACK_EMISSION_FRACTION
    default_weights: dict = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    priority_weights: dict = field(default_factory=lambda: dict(PRIORITY_WEIGHTS))
    vehicle_speeds: dict = field(default_factory=lambda: dict(VEHICLE_SPEEDS))

"""Tests for the matching engine — capacity, route order, deadline, multi-hop, closed hubs."""

from __future__ import annotations

import random
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.config import SimulationConfig
from app.models import (
    GeoPoint,
    Hub,
    HubStatus,
    Metrics,
    PiggybackMode,
    RecoveryOption,
    Route,
    RouteLeg,
    Shipment,
    ShipmentStatus,
    Vehicle,
    VehicleType,
    VehicleStatus,
)
from app.services.state import AppState
from app.pipeline.search import SearchEngine
from app.pipeline.matching import MatchingEngine
from app.pipeline.evaluation import EvaluationEngine
from app.pipeline.decision import DecisionEngine


def make_state():
    config = SimulationConfig()
    state = AppState.__new__(AppState)
    state.config = config
    state.rng = random.Random(42)
    state.tick = 0
    state.sim_time_hours = 0.0
    state.running = True
    state.speed_multiplier = 1.0
    state.hubs = []
    state.routes = []
    state.vehicles = []
    state.shipments = []
    state.assignments = []
    state.events = []
    state.recovery_options = {}
    state.metrics = Metrics()
    state.event_log = []
    state.hubs_by_id = {}
    state.vehicles_by_id = {}
    state.shipments_by_id = {}
    state.routes_by_id = {}
    state.route_legs_by_vehicle = {}
    return state


def make_hub(hid, name, lat, lng, status=HubStatus.ACTIVE):
    return Hub(id=hid, name=name, lat=lat, lng=lng, status=status, transfer_time_hours=2.0, handling_cost_per_kg=0.5)


def make_route(rid, hubs_list):
    legs = []
    for i in range(len(hubs_list) - 1):
        legs.append(RouteLeg(from_hub_id=hubs_list[i], to_hub_id=hubs_list[i+1], distance_km=100.0))
    return Route(id=rid, hub_sequence=hubs_list, legs=legs)


def make_vehicle(vid, vtype, route_seq, cap, used, speed=60, cost=1.0, leg_idx=0, status=VehicleStatus.IN_TRANSIT):
    return Vehicle(
        id=vid, type=vtype, route_hub_sequence=route_seq,
        current_position=GeoPoint(lat=28.0, lng=77.0),
        current_leg_index=leg_idx, progress_on_leg_km=0.0,
        total_capacity_kg=cap, used_capacity_kg=used,
        cost_per_km=cost, speed_kmh=speed, status=status, route_id=f"R-{vid}"
    )


def make_shipment(sid, origin, dest, weight, deadline=100, priority="STANDARD", status=ShipmentStatus.MISPLACED):
    return Shipment(
        id=sid, origin_hub_id=origin, destination_hub_id=dest,
        current_location=GeoPoint(lat=28.0, lng=77.0),
        deadline=deadline, priority=priority, weight_kg=weight,
        status=status, last_scan_event_at=0.0,
        recovery_pickup_hub_id=origin
    )


def setup_basic_state():
    state = make_state()
    h1 = make_hub("H1", "Delhi", 28.0, 77.0)
    h2 = make_hub("H2", "Mumbai", 28.5, 77.5)
    h3 = make_hub("H3", "Pune", 28.8, 77.8)
    state.hubs = [h1, h2, h3]
    state.hubs_by_id = {h.id: h for h in state.hubs}
    route = make_route("R-V1", ["H1", "H2", "H3"])
    state.routes = [route]
    state.routes_by_id = {route.id: route}
    v = make_vehicle("V1", VehicleType.TRUCK, ["H1", "H2", "H3"], cap=1000, used=800, speed=60)
    state.vehicles = [v]
    state.vehicles_by_id = {v.id: v}
    state.route_legs_by_vehicle = {}
    return state


# --- Capacity tests ---

def test_capacity_exact_fit():
    """spare_kg == weight_kg should PASS."""
    state = setup_basic_state()
    state.vehicles[0].used_capacity_kg = 900  # spare = 100
    s = make_shipment("S1", "H1", "H3", weight=100, deadline=100)
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    assert len(matches) >= 1
    assert matches[0]["strategy"] == PiggybackMode.DIRECT


def test_capacity_one_kg_over():
    """spare_kg < weight_kg should FAIL."""
    state = setup_basic_state()
    state.vehicles[0].used_capacity_kg = 901  # spare = 99
    s = make_shipment("S1", "H1", "H3", weight=100, deadline=100)
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    assert len(matches) == 0


# --- Route order tests ---

def test_route_order_reversed():
    """Pickup after destination in route should FAIL."""
    state = setup_basic_state()
    state.vehicles[0].used_capacity_kg = 0  # spare = 1000
    s = make_shipment("S1", "H3", "H1", weight=100, deadline=100)
    s.recovery_pickup_hub_id = "H3"
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    # No direct since H3 is after H1; no multi-hop with only one vehicle
    direct = [m for m in matches if m["strategy"] == PiggybackMode.DIRECT]
    assert len(direct) == 0


# --- Deadline tests ---

def test_deadline_exact():
    """ETA == deadline should PASS (at buffer edge)."""
    state = setup_basic_state()
    state.vehicles[0].used_capacity_kg = 0
    state.vehicles[0].current_leg_index = 0
    state.vehicles[0].progress_on_leg_km = 0
    # Route H1->H2 = 100km, H2->H3 = 100km, speed=60 km/h
    # ETA from H1 to H3 = 200/60 = 3.33h + sim_time(0) = 3.33
    s = make_shipment("S1", "H1", "H3", weight=100, deadline=3.34)
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    assert len(matches) >= 1


def test_deadline_past():
    """ETA > deadline should FAIL."""
    state = setup_basic_state()
    state.vehicles[0].used_capacity_kg = 0
    s = make_shipment("S1", "H1", "H3", weight=100, deadline=1.0)
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    assert len(matches) == 0


# --- Multi-hop tests ---

def test_valid_multi_hop():
    """Valid multi-hop with two vehicles should PASS."""
    state = make_state()
    h1 = make_hub("H1", "Delhi", 28.0, 77.0)
    h2 = make_hub("H2", "Mumbai", 28.5, 77.5)
    h3 = make_hub("H3", "Pune", 28.8, 77.8)
    state.hubs = [h1, h2, h3]
    state.hubs_by_id = {h.id: h for h in state.hubs}
    r1 = make_route("R-V1", ["H1", "H2"])
    r2 = make_route("R-V2", ["H2", "H3"])
    state.routes = [r1, r2]
    state.routes_by_id = {r.id: r for r in state.routes}
    v1 = make_vehicle("V1", VehicleType.TRUCK, ["H1", "H2"], cap=1000, used=0, speed=60)
    v2 = make_vehicle("V2", VehicleType.TRUCK, ["H2", "H3"], cap=1000, used=0, speed=60)
    state.vehicles = [v1, v2]
    state.vehicles_by_id = {v.id: v for v in state.vehicles}
    s = make_shipment("S1", "H1", "H3", weight=100, deadline=100)
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    multi = [m for m in matches if m["strategy"] == PiggybackMode.MULTI_HOP]
    assert len(multi) >= 1


def test_closed_transfer_stop():
    """Multi-hop through closed hub should FAIL."""
    state = make_state()
    h1 = make_hub("H1", "Delhi", 28.0, 77.0)
    h2 = make_hub("H2", "Mumbai", 28.5, 77.5, status=HubStatus.CLOSED)
    h3 = make_hub("H3", "Pune", 28.8, 77.8)
    state.hubs = [h1, h2, h3]
    state.hubs_by_id = {h.id: h for h in state.hubs}
    r1 = make_route("R-V1", ["H1", "H2"])
    r2 = make_route("R-V2", ["H2", "H3"])
    state.routes = [r1, r2]
    state.routes_by_id = {r.id: r for r in state.routes}
    v1 = make_vehicle("V1", VehicleType.TRUCK, ["H1", "H2"], cap=1000, used=0, speed=60)
    v2 = make_vehicle("V2", VehicleType.TRUCK, ["H2", "H3"], cap=1000, used=0, speed=60)
    state.vehicles = [v1, v2]
    state.vehicles_by_id = {v.id: v for v in state.vehicles}
    s = make_shipment("S1", "H1", "H3", weight=100, deadline=100)
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    # V2 route contains closed H2, so V2 excluded from search
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    multi = [m for m in matches if m["strategy"] == PiggybackMode.MULTI_HOP]
    assert len(multi) == 0


# --- Evaluation tests ---

def test_ranking_by_score():
    """Options should be sorted descending by score."""
    state = setup_basic_state()
    state.vehicles[0].used_capacity_kg = 0
    s = make_shipment("S1", "H1", "H3", weight=100, deadline=100)
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    eval_engine = EvaluationEngine(state)
    options = eval_engine.evaluate(s, matches)
    decision = DecisionEngine(state)
    ranked = decision.decide(s, options)
    for i in range(len(ranked) - 1):
        assert ranked[i].score >= ranked[i + 1].score


def test_normalization_single_candidate():
    """Single candidate should have all normalized values = 1.0."""
    state = setup_basic_state()
    state.vehicles[0].used_capacity_kg = 0
    s = make_shipment("S1", "H1", "H3", weight=100, deadline=100)
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    eval_engine = EvaluationEngine(state)
    options = eval_engine.evaluate(s, matches)
    assert len(options) == 1
    assert options[0].score_breakdown.normalized_values["cost"] == 1.0
    assert options[0].score_breakdown.normalized_values["time"] == 1.0
    assert options[0].score_breakdown.normalized_values["util"] == 1.0
    assert options[0].score_breakdown.normalized_values["co2"] == 1.0


def test_explanation_has_real_values():
    """Explanation should contain actual computed numbers."""
    state = setup_basic_state()
    state.vehicles[0].used_capacity_kg = 0
    s = make_shipment("S1", "H1", "H3", weight=100, deadline=100)
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    eval_engine = EvaluationEngine(state)
    options = eval_engine.evaluate(s, matches)
    decision = DecisionEngine(state)
    ranked = decision.decide(s, options)
    assert len(ranked) >= 1
    exp = ranked[0].explanation
    assert len(exp) > 0
    assert "100" in exp or "kg" in exp  # weight mentioned


# --- Recovery state tests ---

def test_recovery_state_transition():
    """Recovery should change status from MISPLACED to RECOVERING."""
    state = setup_basic_state()
    state.vehicles[0].used_capacity_kg = 0
    s = make_shipment("S1", "H1", "H3", weight=100, deadline=100)
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    eval_engine = EvaluationEngine(state)
    options = eval_engine.evaluate(s, matches)
    decision = DecisionEngine(state)
    ranked = decision.decide(s, options)
    state.recovery_options[s.id] = ranked

    from app.pipeline.recovery import RecoveryEngine
    result = RecoveryEngine(state).recover("S1", 1)
    assert result["success"] is True
    assert state.shipments_by_id["S1"].status == ShipmentStatus.RECOVERING


def test_duplicate_recovery():
    """Recovering a package twice should FAIL."""
    state = setup_basic_state()
    state.vehicles[0].used_capacity_kg = 0
    s = make_shipment("S1", "H1", "H3", weight=100, deadline=100)
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    eval_engine = EvaluationEngine(state)
    options = eval_engine.evaluate(s, matches)
    decision = DecisionEngine(state)
    ranked = decision.decide(s, options)
    state.recovery_options[s.id] = ranked

    from app.pipeline.recovery import RecoveryEngine
    RecoveryEngine(state).recover("S1", 1)
    result2 = RecoveryEngine(state).recover("S1", 1)
    assert result2["success"] is False


def test_invalid_weights():
    """Weights summing to zero should FAIL."""
    state = setup_basic_state()
    state.vehicles[0].used_capacity_kg = 0
    s = make_shipment("S1", "H1", "H3", weight=100, deadline=100)
    state.shipments = [s]
    state.shipments_by_id = {s.id: s}
    search = SearchEngine(state)
    cands = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(s, cands)
    eval_engine = EvaluationEngine(state)
    try:
        eval_engine.evaluate(s, matches, {"w_cost": 0, "w_time": 0, "w_util": 0, "w_priority": 0, "w_co2": 0})
        assert False, "Should have raised"
    except ValueError:
        pass

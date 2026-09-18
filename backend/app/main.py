"""FastAPI application entry point for RelayAI."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import CORS_ORIGINS
from app.models import ShipmentStatus
from app.services.state import get_state, reset_state
from app.websocket import websocket_endpoint, manager

app = FastAPI(
    title="RelayAI",
    description="Intelligent Shipment Recovery — SH-205",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def error_handler(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected error occurred.",
                    "request_id": str(uuid.uuid4()),
                },
            },
        )


# --- Request schemas ---

class MatchRequest(BaseModel):
    shipment_id: str

class OptimizeRequest(BaseModel):
    shipment_id: str
    weights: Optional[dict] = None

class RecoverRequest(BaseModel):
    shipment_id: str
    option_rank: int

class SimulationControlRequest(BaseModel):
    action: str  # pause, resume, reset, speed
    speed_multiplier: Optional[float] = None

class CloseHubRequest(BaseModel):
    hub_id: Optional[str] = None


# --- API Routes ---

@app.get("/api/state")
async def get_full_state():
    state = get_state()
    return {"success": True, "data": state.get_state_snapshot()}


@app.post("/api/match")
async def match_shipment(req: MatchRequest):
    state = get_state()
    ship = state.shipments_by_id.get(req.shipment_id)
    if ship is None:
        return JSONResponse(
            status_code=404,
            content={"success": False, "error": {"code": "NOT_FOUND", "message": f"Package {req.shipment_id} not found"}},
        )
    if ship.status != ShipmentStatus.MISPLACED:
        return JSONResponse(
            status_code=409,
            content={"success": False, "error": {"code": "NOT_MISPLACED", "message": "This package is not lost."}},
        )

    from app.pipeline.search import SearchEngine
    from app.pipeline.matching import MatchingEngine

    search = SearchEngine(state)
    candidates = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(ship, candidates)

    state.add_log("search", f"Looking for trucks going toward {state.hubs_by_id.get(ship.destination_hub_id, None) and state.hubs_by_id[ship.destination_hub_id].name}...", shipment_id=ship.id)
    state.add_log("matching", f"Found {len(matches)} rescue plan(s) for {ship.id}", shipment_id=ship.id)

    return {"success": True, "data": {"shipment_id": ship.id, "candidate_count": len(matches), "candidates": [{"strategy": m["strategy"].value, "vehicle_ids": m["vehicle_ids"]} for m in matches]}}


@app.post("/api/optimize")
async def optimize_shipment(req: OptimizeRequest):
    state = get_state()
    ship = state.shipments_by_id.get(req.shipment_id)
    if ship is None:
        return JSONResponse(
            status_code=404,
            content={"success": False, "error": {"code": "NOT_FOUND", "message": f"Package {req.shipment_id} not found"}},
        )
    if ship.status != ShipmentStatus.MISPLACED:
        return JSONResponse(
            status_code=409,
            content={"success": False, "error": {"code": "NOT_MISPLACED", "message": "This package is not lost."}},
        )

    from app.pipeline.search import SearchEngine
    from app.pipeline.matching import MatchingEngine
    from app.pipeline.evaluation import EvaluationEngine
    from app.pipeline.decision import DecisionEngine

    search = SearchEngine(state)
    candidates = search.run()
    matching = MatchingEngine(state)
    matches = matching.find_candidates(ship, candidates)

    if not matches:
        state.recovery_options[ship.id] = []
        state.add_log("optimize", f"No rescue plans available for {ship.id}", shipment_id=ship.id)
        return {"success": True, "data": {"shipment_id": ship.id, "options": [], "message": "No feasible rescue plans found."}}

    try:
        evaluation = EvaluationEngine(state)
        options = evaluation.evaluate(ship, matches, req.weights)
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": {"code": "INVALID_WEIGHTS", "message": str(e)}},
        )

    decision = DecisionEngine(state)
    ranked = decision.decide(ship, options)
    state.recovery_options[ship.id] = ranked

    state.add_log("optimize", f"Generated {len(ranked)} rescue plan(s) for {ship.id}", shipment_id=ship.id)

    return {"success": True, "data": {"shipment_id": ship.id, "options": [o.model_dump() for o in ranked]}}


@app.post("/api/recover")
async def recover_shipment(req: RecoverRequest):
    state = get_state()
    from app.pipeline.recovery import RecoveryEngine
    engine = RecoveryEngine(state)
    result = engine.recover(req.shipment_id, req.option_rank)
    if not result.get("success"):
        return JSONResponse(status_code=409, content=result)
    return result


@app.get("/api/events")
async def get_events():
    state = get_state()
    return {"success": True, "data": state.event_log[-100:]}


@app.get("/api/metrics")
async def get_metrics():
    state = get_state()
    state.update_metrics()
    return {"success": True, "data": state.metrics.model_dump()}


@app.post("/api/simulation/control")
async def simulation_control(req: SimulationControlRequest):
    state = get_state()
    action = req.action.lower()
    if action == "pause":
        state.running = False
    elif action == "resume":
        state.running = True
    elif action == "reset":
        reset_state()
    elif action == "speed":
        if req.speed_multiplier is not None and req.speed_multiplier > 0:
            state.speed_multiplier = req.speed_multiplier
    else:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": {"code": "INVALID_ACTION", "message": f"Unknown action: {action}"}},
        )
    return {"success": True, "data": {"running": state.running, "speed_multiplier": state.speed_multiplier}}


@app.post("/api/chaos/close-hub")
async def close_hub(req: CloseHubRequest):
    state = get_state()
    hub_id = req.hub_id
    if hub_id is None:
        # Pick a random active hub
        active = [h for h in state.hubs if h.status.value == "ACTIVE"]
        if not active:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": {"code": "NO_HUB", "message": "No active hubs to close"}},
            )
        hub_id = state.rng.choice(active).id

    hub = state.hubs_by_id.get(hub_id)
    if hub is None:
        return JSONResponse(
            status_code=404,
            content={"success": False, "error": {"code": "NOT_FOUND", "message": f"City {hub_id} not found"}},
        )
    if hub.status.value == "CLOSED":
        return JSONResponse(
            status_code=409,
            content={"success": False, "error": {"code": "ALREADY_CLOSED", "message": f"{hub.name} is already closed"}},
        )

    hub.status = "CLOSED"

    # Find affected shipments
    affected: list[str] = []
    for s in state.shipments:
        if s.status in (ShipmentStatus.DELIVERED, ShipmentStatus.RECOVERED):
            continue
        # Check if shipment's route depends on this hub
        v = state.vehicles_by_id.get(s.assigned_vehicle_id) if s.assigned_vehicle_id else None
        if v and hub_id in v.route_hub_sequence:
            s.status = ShipmentStatus.DISRUPTED
            affected.append(s.id)
        elif s.recovery_pickup_hub_id == hub_id:
            s.status = ShipmentStatus.MISPLACED
            affected.append(s.id)

    state.add_log("chaos", f"{hub.name} closed. {len(affected)} packages need new plans.", hub_id=hub_id, affected_count=len(affected))

    # Re-run matching for affected shipments
    from app.pipeline.search import SearchEngine
    from app.pipeline.matching import MatchingEngine
    from app.pipeline.evaluation import EvaluationEngine
    from app.pipeline.decision import DecisionEngine
    from app.pipeline.detection import DetectionEngine

    # Re-flag disrupted packages as misplaced so detection picks them up
    for sid in affected:
        s = state.shipments_by_id.get(sid)
        if s and s.status == ShipmentStatus.DISRUPTED:
            s.status = ShipmentStatus.MISPLACED

    return {
        "success": True,
        "data": {
            "hub_id": hub_id,
            "hub_name": hub.name,
            "affected_count": len(affected),
            "affected_shipments": affected,
        },
    }


@app.websocket("/ws/simulation")
async def ws_endpoint(websocket: WebSocket):
    await websocket_endpoint(websocket)

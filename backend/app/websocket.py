"""WebSocket handler for real-time simulation updates."""

from __future__ import annotations

import asyncio
import json
from typing import TYPE_CHECKING

from fastapi import WebSocket, WebSocketDisconnect

if TYPE_CHECKING:
    from app.services.state import AppState


class ConnectionManager:
    """Manages WebSocket connections and broadcasts state updates."""

    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict) -> None:
        msg = json.dumps(data, default=str)
        dead: list[WebSocket] = []
        for ws in self.active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


async def websocket_endpoint(ws: WebSocket) -> None:
    from app.services.state import get_state
    from app.simulation.engine import SimulationEngine

    await manager.connect(ws)
    state = get_state()
    engine = SimulationEngine(state)

    try:
        # Send initial state
        await ws.send_text(json.dumps(state.get_state_snapshot(), default=str))

        while True:
            if state.running:
                engine.tick()
                # Run detection
                from app.pipeline.detection import DetectionEngine
                DetectionEngine(state).run()

                # Check recovery completions
                from app.pipeline.recovery import RecoveryEngine
                RecoveryEngine(state).check_recovery_completion()

                state.update_metrics()

            snapshot = state.get_state_snapshot()
            await ws.send_text(json.dumps(snapshot, default=str))
            await asyncio.sleep(1.0 / max(1, state.speed_multiplier))
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)

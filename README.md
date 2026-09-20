# RelayAI — Intelligent Shipment Recovery
## Demo

**🔗 Live Demo:** [Open RelayAI](https://relayai-shipment-recovery.netlify.app/)

### How to Demo

1. **Launch the app** — View the live logistics network with hubs, vehicles, and shipments.
2. **Detect** — Misplaced shipments are automatically identified using anomaly detection rules.
3. **Select a shipment** — Click a red/misplaced package to inspect the issue and available recovery options.
4. **Compare plans** — Review rescue strategies based on **cost, delivery time, capacity utilization, priority, and CO₂ savings**.
5. **Recover** — Select a recovery plan and execute it to move the shipment into recovery.
6. **Track results** — Watch the shipment status and live metrics update in real time.
7. **Try Chaos Mode** — Simulate a city/hub closure and observe how RelayAI detects affected shipments and generates new recovery plans.

> **💡 Tip:** For the fastest demonstration, wait for a misplaced shipment to appear or use **Chaos Mode** to trigger a recovery scenario immediately.

## Problem (SH-205)

Detect misplaced shipments and identify opportunities to piggyback them onto existing shipments or transportation routes. The system evaluates routes, transfer stops, vehicle capacity, deadlines, costs, shipment priorities, delivery time, resource utilization, and pollution/environmental impact, then selects and ranks feasible recovery strategies.

## Solution

RelayAI is a real-time logistics command center that simulates a shipment network, detects misplaced packages using three rules, searches for vehicles with spare capacity, matches packages using four piggyback strategies, evaluates candidates with weighted scoring, and lets operators choose rescue plans — all backed by real computation with no fabricated data.

## Architecture

```
relayai/
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI route handlers
│   │   ├── models/         # Pydantic data models
│   │   ├── pipeline/       # Detection, search, matching, evaluation, decision, recovery
│   │   ├── simulation/     # Generator, tick engine, geo utilities
│   │   ├── services/       # Central state manager
│   │   ├── config.py       # All configuration constants
│   │   ├── websocket.py    # WebSocket connection manager
│   │   └── main.py         # FastAPI app entry point
│   ├── tests/              # Pytest tests (13 tests)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/     # Header, Sidebar, MapView, Inspector, Scoreboard, EventFeed, ChaosOverlay, Toast, Tour
│   │   ├── api/            # API client, WebSocket client
│   │   ├── hooks/          # useSimulationState hook
│   │   ├── types/          # TypeScript types
│   │   └── styles/         # Global CSS
│   └── package.json
└── docs/
    ├── architecture.md
    └── api.md
```

## System Flow

```
SIMULATION (asyncio tick loop)
  ↓
ANOMALY (2% of in-transit shipments)
  ↓
DETECTION (3 rules: stale scan, route deviation, missed connection)
  ↓
LOST PACKAGE (status → MISPLACED)
  ↓
SEARCH (vehicles with spare capacity)
  ↓
MATCHING (4 strategies: direct, consolidation, multi-hop, repositioning)
  ↓
EVALUATION (cost, time, utilization, CO2, priority)
  ↓
WEIGHTED SCORING (normalized 0–1)
  ↓
TOP 3 PLANS (ranked by score)
  ↓
HUMAN DECISION (operator chooses plan)
  ↓
RECOVERY (validated, executed, status → RECOVERING)
  ↓
RECOVERED (status → RECOVERED/DELIVERED)
  ↓
LIVE METRICS (scoreboard updates)
  ↓
CHAOS MODE (city closes → re-planning)
```

## Pipeline

### Detection (pipeline/detection.py)
Three rules identify misplaced shipments:
1. **Stale scan** — `now - last_scan_event_at > 8h` → MEDIUM severity
2. **Route deviation** — distance from planned route > 50km → HIGH severity
3. **Missed connection** — vehicle completed leg but package not scanned → HIGH severity

### Search (pipeline/search.py)
Finds all vehicles with spare capacity on routes without closed hubs.

### Matching (pipeline/matching.py)
Four strategies:
1. **Direct Piggyback** — pickup and destination on same route, pickup before destination, capacity fits
2. **Consolidation** — shares vehicle with another shipment going to same destination
3. **Multi-Hop** — vehicle A to transfer stop, vehicle B to destination
4. **Fallback Repositioning** — moves package to nearest hub with outbound coverage

### Evaluation (pipeline/evaluation.py)
Computes real values:
- **Piggyback cost** = distance × cost_per_km + handling_cost × weight
- **Dedicated cost** = distance × $2.5/km + handling
- **Money saved** = dedicated_cost - piggyback_cost
- **CO2 saved** = dedicated_emissions - piggyback_emissions
- **Space used** = shipment_weight / spare_capacity
- **Delay** = estimated_arrival - deadline

### Scoring
```
score = 0.30 × cost_score + 0.25 × time_score + 0.20 × utilization_score
        + 0.15 × priority_weight + 0.10 × co2_score
```
All metrics normalized to 0–1. Single candidate → all normalized values = 1.0.

## Simulation

- 1 real second = 1 simulated hour (configurable speed multiplier: 1x, 10x, 60x)
- 20 hubs (Indian cities), 30 vehicles, 100 shipments
- Deterministic with seed 42
- Anomalies induced naturally in ~2% of in-transit shipments per tick
- No SimPy — pure asyncio tick loop

## Chaos Mode

POST `/api/chaos/close-hub` closes a hub, finds affected shipments whose routes depend on it, re-flags them as misplaced, and triggers re-planning.

## Frontend

- React + TypeScript + Vite
- react-leaflet with OpenStreetMap (dark CARTO tiles)
- Dark command center UI with semantic colors:
  - Red = lost, Blue = recovering, Green = recovered, Gray = delivered
- Real-time WebSocket updates
- Plain English UI (no internal terminology)

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/state` | GET | Full simulation state |
| `/api/match` | POST | Find candidates for a shipment |
| `/api/optimize` | POST | Evaluate and rank rescue plans |
| `/api/recover` | POST | Execute chosen recovery plan |
| `/api/events` | GET | Event log |
| `/api/metrics` | GET | Current metrics |
| `/api/simulation/control` | POST | Pause/resume/reset/speed |
| `/api/chaos/close-hub` | POST | Close a hub (Chaos Mode) |
| `/ws/simulation` | WS | Real-time state updates |
| `/docs` | GET | Swagger UI |

## Testing

```bash
cd backend
python3 -m pytest tests/ -v
# 13 passed
```

Tests cover: capacity exact fit/over, route order, deadline edge cases, multi-hop, closed transfer stop, ranking, normalization, explanations, recovery state transitions, duplicate recovery, invalid weights.

## Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` and `/ws` to `http://localhost:8000`.

## Demo Instructions

1. Open the app — you'll see a live logistics network with vehicles and packages moving on the map.
2. Within ~30 seconds, packages will turn red (lost) as anomalies are detected.
3. Click a red package to see why it's lost and view rescue plans.
4. Compare the plans (cost, time, space, pollution) and choose one.
5. Watch the package turn blue (recovering) then green (recovered).
6. The scoreboard updates with real savings.
7. Click "Simulate a City Closing" to trigger Chaos Mode and watch re-planning happen live.

## Simulated vs Real Components

**Simulated (input data):**
- Hub locations, vehicle routes, shipment assignments (deterministic with seed 42)
- Anomaly induction (random scenarios A/B/C at 2% rate)
- Vehicle movement along routes

**Real (computed logic):**
- Detection (3 rules with actual thresholds)
- Route distances (haversine formula)
- Spare capacity calculations
- Matching feasibility (capacity, route order, deadline, closed hubs)
- Cost, CO2, time, utilization metrics
- Weighted scoring with normalization
- Recovery state transitions with validation
- WebSocket state broadcasts

## Limitations

- In-memory state only (no database) — intentional for hackathon prototype
- No authentication
- No external carrier integrations
- Vehicle icons are simple shapes (no rotation toward heading)
- Map uses free OpenStreetMap/CARTO tiles
#   R e l a y A I 
 
 

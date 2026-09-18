# API Documentation

## Base URL

All endpoints are relative to the backend server (default: `http://localhost:8000`).

## Endpoints

### GET /api/state

Returns the full simulation state snapshot.

**Response:**
```json
{
  "success": true,
  "data": {
    "tick": 42,
    "sim_time_hours": 42.0,
    "running": true,
    "speed_multiplier": 1.0,
    "hubs": [...],
    "vehicles": [...],
    "shipments": [...],
    "routes": [...],
    "assignments": [...],
    "events": [...],
    "metrics": {...},
    "event_log": [...]
  }
}
```

### POST /api/match

Find candidate vehicles for a misplaced shipment.

**Request:**
```json
{ "shipment_id": "SHP-0011" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "shipment_id": "SHP-0011",
    "candidate_count": 5,
    "candidates": [...]
  }
}
```

**Errors:**
- 404: Shipment not found
- 409: Shipment is not misplaced

### POST /api/optimize

Evaluate and rank rescue plans for a shipment.

**Request:**
```json
{
  "shipment_id": "SHP-0011",
  "weights": {
    "w_cost": 0.30,
    "w_time": 0.25,
    "w_util": 0.20,
    "w_priority": 0.15,
    "w_co2": 0.10
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "shipment_id": "SHP-0011",
    "options": [
      {
        "id": "OPT-SHP-0011-1",
        "rank": 1,
        "strategy_label": "SAME TRUCK, STRAIGHT THERE",
        "piggyback_mode": "DIRECT",
        "vehicle_ids": ["V-0005"],
        "estimated_cost_usd": 120.0,
        "dedicated_cost_usd": 240.0,
        "cost_saved_usd": 120.0,
        "estimated_delay_hours": -2.0,
        "co2_saved_kg": 12.4,
        "utilization_gain": 0.71,
        "score": 0.8875,
        "score_breakdown": {...},
        "explanation": "Truck V0005 has 200kg of empty space..."
      }
    ]
  }
}
```

**Errors:**
- 404: Shipment not found
- 409: Shipment is not misplaced
- 400: Invalid weights (negative or sum to zero)

### POST /api/recover

Execute a chosen rescue plan.

**Request:**
```json
{
  "shipment_id": "SHP-0011",
  "option_rank": 1
}
```

**Response:**
```json
{
  "success": true,
  "shipment_id": "SHP-0011",
  "option": {...}
}
```

**Errors:**
- 404: Shipment not found
- 409: Shipment no longer misplaced, capacity conflict, hub closed, or deadline missed

### GET /api/events

Returns the last 100 event log entries.

### GET /api/metrics

Returns current aggregate metrics.

### POST /api/simulation/control

Control the simulation.

**Request:**
```json
{
  "action": "speed",
  "speed_multiplier": 10
}
```

Actions: `pause`, `resume`, `reset`, `speed`

### POST /api/chaos/close-hub

Close a hub and trigger re-planning.

**Request:**
```json
{ "hub_id": "H-01" }
```

If `hub_id` is omitted, a random active hub is closed.

**Response:**
```json
{
  "success": true,
  "data": {
    "hub_id": "H-01",
    "hub_name": "Delhi",
    "affected_count": 14,
    "affected_shipments": ["SHP-0003", "SHP-0007", ...]
  }
}
```

### WebSocket /ws/simulation

Connects to receive real-time state updates. Sends a full state snapshot every tick (~1 second at 1x speed).

### GET /docs

Swagger UI for interactive API exploration.

## Error Format

All errors return structured JSON:
```json
{
  "success": false,
  "error": {
    "code": "RECOVERY_CONFLICT",
    "message": "This package is no longer available for recovery."
  }
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Invalid request |
| 404 | Entity not found |
| 409 | State or capacity conflict |
| 422 | Validation error |
| 500 | Unexpected server error |

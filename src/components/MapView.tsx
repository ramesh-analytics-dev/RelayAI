import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useRef } from "react";
import type { Hub, RecoveryOption } from "../types";
import type { EngineState } from "../engine/engine";

interface MapViewProps {
  engine: EngineState;
  selectedShipmentId: string | null;
  rescuePlans: RecoveryOption[];
  onSelectShipment: (id: string | null) => void;
}

const STATUS_COLORS: Record<string, string> = {
  IN_TRANSIT: "#3fb950",
  MISPLACED: "#f85149",
  RECOVERING: "#2f81f7",
  RECOVERED: "#3fb950",
  DELIVERED: "#6e7681",
  DISRUPTED: "#f85149",
};

function MapFocus({ engine, selectedShipmentId }: { engine: EngineState; selectedShipmentId: string | null }) {
  const map = useMap();
  const hasFocused = useRef(false);

  useEffect(() => {
    if (!hasFocused.current && engine.hubs.length > 0) {
      const lats = engine.hubs.map((h) => h.lat);
      const lngs = engine.hubs.map((h) => h.lng);
      const bounds = L.latLngBounds([
        [Math.min(...lats) - 0.3, Math.min(...lngs) - 0.3],
        [Math.max(...lats) + 0.3, Math.max(...lngs) + 0.3],
      ]);
      map.fitBounds(bounds, { padding: [40, 40] });
      hasFocused.current = true;
    }
  }, [engine, map]);

  useEffect(() => {
    if (selectedShipmentId) {
      const ship = engine.shipments.find((s) => s.id === selectedShipmentId);
      if (ship) {
        map.flyTo([ship.current_location.lat, ship.current_location.lng], 8, { duration: 0.8 });
      }
    }
  }, [selectedShipmentId, engine, map]);

  return null;
}

interface RoutePath {
  positions: [number, number][];
  key: string;
  color: string;
  weight: number;
  opacity: number;
  dashed: boolean;
}

function hubToLatLng(hub: Hub | undefined): [number, number] | null {
  if (!hub) return null;
  return [hub.lat, hub.lng];
}

function buildRecoveryPath(
  engine: EngineState,
  option: RecoveryOption,
  hubsById: Record<string, Hub>,
): [number, number][] {
  const ship = engine.shipments_by_id[option.shipment_id];
  if (!ship) return [];

  const pathHubIds: string[] = [];
  const pickupId = ship.recovery_pickup_hub_id || option.transfer_hub_ids[0] || null;
  if (pickupId) pathHubIds.push(pickupId);
  for (const tid of option.transfer_hub_ids) {
    if (!pathHubIds.includes(tid)) pathHubIds.push(tid);
  }
  if (!pathHubIds.includes(ship.destination_hub_id)) {
    pathHubIds.push(ship.destination_hub_id);
  }

  const positions: [number, number][] = [];
  if (ship.status === "MISPLACED") {
    positions.push([ship.current_location.lat, ship.current_location.lng]);
  }
  for (const hid of pathHubIds) {
    const pos = hubToLatLng(hubsById[hid]);
    if (pos) positions.push(pos);
  }
  return positions;
}

export function MapView({ engine, selectedShipmentId, rescuePlans, onSelectShipment }: MapViewProps) {
  const hubsById: Record<string, Hub> = {};
  engine.hubs.forEach((h) => (hubsById[h.id] = h));

  const selectedShip = engine.shipments.find((s) => s.id === selectedShipmentId);

  // Base routes — active vs blocked
  const routeLines: { positions: [number, number][]; key: string; blocked: boolean }[] = [];
  engine.routes.forEach((r) => {
    let blocked = false;
    const positions: [number, number][] = [];
    for (const hid of r.hub_sequence) {
      const h = hubsById[hid];
      if (!h) continue;
      if (h.status === "CLOSED") blocked = true;
      positions.push([h.lat, h.lng]);
    }
    if (positions.length >= 2) routeLines.push({ positions, key: r.id, blocked });
  });

  // Recovery paths for selected misplaced shipment
  const recoveryPaths: RoutePath[] = [];
  if (selectedShip && selectedShip.status === "MISPLACED" && rescuePlans.length > 0) {
    rescuePlans.forEach((plan, idx) => {
      const positions = buildRecoveryPath(engine, plan, hubsById);
      if (positions.length >= 2) {
        const isBest = idx === 0;
        recoveryPaths.push({
          positions,
          key: `rec-${plan.id}`,
          color: isBest ? "#3fb950" : "#d29922",
          weight: isBest ? 4 : 2,
          opacity: isBest ? 0.9 : 0.5,
          dashed: false,
        });
      }
    });
  }

  // Current vehicle route for selected shipment
  let vehicleRoute: [number, number][] | null = null;
  if (selectedShip && selectedShip.assigned_vehicle_id) {
    const v = engine.vehicles.find((v) => v.id === selectedShip.assigned_vehicle_id);
    if (v) {
      vehicleRoute = v.route_hub_sequence
        .map((hid) => hubsById[hid])
        .filter((h) => h)
        .map((h) => [h.lat, h.lng]) as [number, number][];
    }
  }

  const originHub = selectedShip ? hubsById[selectedShip.origin_hub_id] : null;
  const destHub = selectedShip ? hubsById[selectedShip.destination_hub_id] : null;

  return (
    <MapContainer
      center={[28.0, 77.0]}
      zoom={7}
      style={{ width: "100%", height: "100%", background: "var(--bg-base)" }}
      zoomControl={true}
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />

      <MapFocus engine={engine} selectedShipmentId={selectedShipmentId} />

      {/* Base routes */}
      {routeLines.map((rl) => (
        <Polyline key={rl.key} positions={rl.positions}
          pathOptions={{
            color: rl.blocked ? "#f85149" : "#2a3a4a",
            weight: 1,
            opacity: rl.blocked ? 0.3 : 0.4,
            dashArray: "4 4",
          }} />
      ))}

      {/* Current vehicle route (blue, when shipment selected) */}
      {vehicleRoute && vehicleRoute.length >= 2 && (
        <Polyline key="vehicle-route" positions={vehicleRoute}
          pathOptions={{ color: "#2f81f7", weight: 3, opacity: 0.7 }} />
      )}

      {/* Recovery paths — recommended (green) and alternatives (amber) */}
      {recoveryPaths.map((rp) => (
        <Polyline key={rp.key} positions={rp.positions}
          pathOptions={{
            color: rp.color,
            weight: rp.weight,
            opacity: rp.opacity,
            dashArray: rp.dashed ? "6 4" : undefined,
          }} />
      ))}

      {/* Hubs */}
      {engine.hubs.map((h) => {
        const isOrigin = selectedShip && h.id === selectedShip.origin_hub_id;
        const isDest = selectedShip && h.id === selectedShip.destination_hub_id;
        const isPickup = selectedShip && h.id === selectedShip.recovery_pickup_hub_id;
        return (
          <CircleMarker
            key={h.id}
            center={[h.lat, h.lng]}
            radius={isOrigin || isDest ? 9 : isPickup ? 8 : 6}
            pathOptions={{
              color: h.status === "CLOSED" ? "#f85149" : isOrigin ? "#3fb950" : isDest ? "#d29922" : "#4a5568",
              fillColor: h.status === "CLOSED" ? "#6e7681" : isOrigin ? "#3fb950" : isDest ? "#d29922" : isPickup ? "#2f81f7" : "#2a3a4a",
              fillOpacity: 0.8,
              weight: isOrigin || isDest || isPickup ? 3 : 2,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={0.9}>
              <div style={{ fontSize: "12px" }}>
                <strong>{h.name}</strong>
                <br />
                {h.status === "CLOSED" ? "CLOSED" : "Active"}
                {isOrigin && " — Origin"}
                {isDest && " — Destination"}
                {isPickup && " — Pickup point"}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* Vehicles */}
      {engine.vehicles.map((v) => (
        <CircleMarker key={v.id} center={[v.current_position.lat, v.current_position.lng]} radius={3}
          pathOptions={{ color: "#2f81f7", fillColor: "#2f81f7", fillOpacity: 0.6, weight: 1 }}>
          <Tooltip direction="top" offset={[0, -5]} opacity={0.9}>
            <div style={{ fontSize: "11px" }}>{v.type} {v.id}</div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Shipments */}
      {engine.shipments.map((s) => {
        const color = STATUS_COLORS[s.status] || "#3fb950";
        const isLost = s.status === "MISPLACED";
        const isRecovering = s.status === "RECOVERING";
        const isSelected = s.id === selectedShipmentId;
        return (
          <CircleMarker
            key={s.id}
            center={[s.current_location.lat, s.current_location.lng]}
            radius={isLost || isRecovering ? 8 : 4}
            pathOptions={{ color, fillColor: color, fillOpacity: isLost ? 0.8 : 0.5, weight: isSelected ? 3 : 2 }}
            eventHandlers={{ click: () => { if (isLost) onSelectShipment(s.id); } }}
          >
            {(isLost || isSelected) && (
              <Tooltip direction="top" offset={[0, -10]} opacity={0.95} permanent={isLost && !isSelected}>
                <div style={{ fontSize: "11px", fontWeight: 600 }}>{s.id}</div>
              </Tooltip>
            )}
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

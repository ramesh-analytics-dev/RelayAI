import type { GeoPoint, Hub, Route } from "../types";

export function haversine_km(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371.0;
  const dlat = (lat2 - lat1) * Math.PI / 180;
  const dlng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dlng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function pointToSegmentDistanceKm(point: GeoPoint, segStart: GeoPoint, segEnd: GeoPoint): number {
  const px = point.lng, py = point.lat;
  const ax = segStart.lng, ay = segStart.lat;
  const bx = segEnd.lng, by = segEnd.lat;
  const dx = bx - ax, dy = by - ay;
  const segLenSq = dx * dx + dy * dy;
  if (segLenSq === 0) return haversine_km(point.lat, point.lng, segStart.lat, segStart.lng);
  let t = ((px - ax) * dx + (py - ay) * dy) / segLenSq;
  t = Math.max(0, Math.min(1, t));
  const projLat = ay + t * dy, projLng = ax + t * dx;
  return haversine_km(point.lat, point.lng, projLat, projLng);
}

export function minDistanceToRouteKm(point: GeoPoint, route: Route, hubsById: Record<string, Hub>): number {
  let minDist = Infinity;
  for (const leg of route.legs) {
    const hFrom = hubsById[leg.from_hub_id];
    const hTo = hubsById[leg.to_hub_id];
    if (!hFrom || !hTo) continue;
    const d = pointToSegmentDistanceKm(
      point,
      { lat: hFrom.lat, lng: hFrom.lng },
      { lat: hTo.lat, lng: hTo.lng },
    );
    if (d < minDist) minDist = d;
  }
  return minDist;
}

export function interpolateOnLeg(start: GeoPoint, end: GeoPoint, frac: number): GeoPoint {
  return {
    lat: start.lat + (end.lat - start.lat) * frac,
    lng: start.lng + (end.lng - start.lng) * frac,
  };
}

export function nearestHub(point: GeoPoint, hubs: Hub[], activeOnly: boolean = false): Hub | null {
  let best: Hub | null = null;
  let bestDist = Infinity;
  for (const h of hubs) {
    if (activeOnly && h.status !== "ACTIVE") continue;
    const d = haversine_km(point.lat, point.lng, h.lat, h.lng);
    if (d < bestDist) { bestDist = d; best = h; }
  }
  return best;
}

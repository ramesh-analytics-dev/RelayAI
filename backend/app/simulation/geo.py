"""Geographic utility functions for RelayAI."""

from __future__ import annotations

import math
from typing import Optional

from app.models import GeoPoint, Hub, Route, RouteLeg


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two lat/lng points in km using haversine formula."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def hub_distance_km(h1: Hub, h2: Hub) -> float:
    return haversine_km(h1.lat, h1.lng, h2.lat, h2.lng)


def point_to_segment_distance_km(
    point: GeoPoint, seg_start: GeoPoint, seg_end: GeoPoint
) -> float:
    """Minimum distance from a point to a great-circle segment in km.

    Uses equirectangular approximation for small distances, which is adequate
    for the ~1.5-degree jitter used in this simulation.
    """
    px, py = point.lng, point.lat
    ax, ay = seg_start.lng, seg_start.lat
    bx, by = seg_end.lng, seg_end.lat

    dx = bx - ax
    dy = by - ay
    seg_len_sq = dx * dx + dy * dy

    if seg_len_sq == 0:
        return haversine_km(point.lat, point.lng, seg_start.lat, seg_start.lng)

    t = ((px - ax) * dx + (py - ay) * dy) / seg_len_sq
    t = max(0.0, min(1.0, t))
    proj_lat = ay + t * dy
    proj_lng = ax + t * dx
    return haversine_km(point.lat, point.lng, proj_lat, proj_lng)


def min_distance_to_route_km(point: GeoPoint, route: Route, hubs_by_id: dict[str, Hub]) -> float:
    """Minimum distance from a point to any leg of a route."""
    min_dist = float("inf")
    for leg in route.legs:
        h_from = hubs_by_id.get(leg.from_hub_id)
        h_to = hubs_by_id.get(leg.to_hub_id)
        if h_from is None or h_to is None:
            continue
        d = point_to_segment_distance_km(
            point,
            GeoPoint(lat=h_from.lat, lng=h_from.lng),
            GeoPoint(lat=h_to.lat, lng=h_to.lng),
        )
        if d < min_dist:
            min_dist = d
    return min_dist


def interpolate_on_leg(seg_start: GeoPoint, seg_end: GeoPoint, frac: float) -> GeoPoint:
    """Linear interpolation between two geo points."""
    return GeoPoint(
        lat=seg_start.lat + (seg_end.lat - seg_start.lat) * frac,
        lng=seg_start.lng + (seg_end.lng - seg_start.lng) * frac,
    )


def nearest_hub(point: GeoPoint, hubs: list[Hub], active_only: bool = False) -> Optional[Hub]:
    """Find the nearest hub to a point."""
    best: Optional[Hub] = None
    best_dist = float("inf")
    for h in hubs:
        if active_only and h.status.value != "ACTIVE":
            continue
        d = haversine_km(point.lat, point.lng, h.lat, h.lng)
        if d < best_dist:
            best_dist = d
            best = h
    return best

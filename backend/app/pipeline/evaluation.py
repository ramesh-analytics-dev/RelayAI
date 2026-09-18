"""Evaluation engine — computes cost, time, CO2, utilization for each candidate."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.models import PiggybackMode, RecoveryOption, ScoreBreakdown, Shipment
from app.config import PRIORITY_WEIGHTS

if TYPE_CHECKING:
    from app.services.state import AppState


class EvaluationEngine:
    """Evaluates and scores recovery candidates with weighted scoring."""

    def __init__(self, state: "AppState"):
        self.state = state

    def evaluate(
        self,
        shipment: Shipment,
        candidates: list[dict],
        weights: dict | None = None,
    ) -> list[RecoveryOption]:
        state = self.state
        w = {**state.config.default_weights}
        if weights:
            w.update(weights)
        # Validate weights
        for k, val in w.items():
            if val < 0:
                raise ValueError(f"Weight {k} must be >= 0")
        if sum(w.values()) == 0:
            raise ValueError("Sum of weights must be > 0")

        options: list[RecoveryOption] = []
        for i, cand in enumerate(candidates):
            opt = self._evaluate_one(shipment, cand, i)
            options.append(opt)

        if not options:
            return []

        # Normalize and score
        self._normalize_and_score(options, shipment, w)
        return options

    def _evaluate_one(self, s: Shipment, cand: dict, idx: int) -> RecoveryOption:
        state = self.state
        v = cand["vehicle"]
        distance = cand["distance_km"]
        spare = cand["spare_capacity_kg"]
        eta = cand["eta_hours"]

        # Estimated piggyback cost
        piggyback_cost = distance * v.cost_per_km
        if cand.get("transfer_time_hours"):
            transfer_hub = state.hubs_by_id.get(cand["transfer_hub_ids"][0]) if cand["transfer_hub_ids"] else None
            if transfer_hub:
                piggyback_cost += transfer_hub.handling_cost_per_kg * s.weight_kg

        # Dedicated cost
        dedicated_cost = distance * state.config.dedicated_cost_per_km
        if cand.get("transfer_time_hours") and cand["transfer_hub_ids"]:
            transfer_hub = state.hubs_by_id.get(cand["transfer_hub_ids"][0])
            if transfer_hub:
                dedicated_cost += transfer_hub.handling_cost_per_kg * s.weight_kg

        cost_saved = dedicated_cost - piggyback_cost

        # Delay (negative = early)
        delay = eta - s.deadline

        # Space used
        space_used = s.weight_kg / spare if spare > 0 else 1.0

        # CO2
        dedicated_co2 = distance * state.config.emission_factor
        piggyback_co2 = distance * state.config.emission_factor * state.config.piggyback_emission_fraction
        co2_saved = dedicated_co2 - piggyback_co2

        # Strategy label
        strategy = cand["strategy"]
        labels = {
            PiggybackMode.DIRECT: "SAME TRUCK, STRAIGHT THERE",
            PiggybackMode.CONSOLIDATION: "SHARED DELIVERY",
            PiggybackMode.MULTI_HOP: "TWO-VEHICLE RELAY",
            PiggybackMode.REPOSITIONING: "REPOSITION & RESHIP",
        }

        vehicle_ids = cand["vehicle_ids"]
        v_short = vehicle_ids[0].replace("V-", "V")
        if len(vehicle_ids) > 1:
            v_short2 = vehicle_ids[1].replace("V-", "V")
            label = labels.get(strategy, strategy.value)
        else:
            label = labels.get(strategy, strategy.value)

        return RecoveryOption(
            id=f"OPT-{s.id}-{idx+1}",
            shipment_id=s.id,
            strategy_label=label,
            piggyback_mode=strategy,
            vehicle_ids=vehicle_ids,
            transfer_hub_ids=cand.get("transfer_hub_ids", []),
            estimated_cost_usd=round(piggyback_cost, 2),
            dedicated_cost_usd=round(dedicated_cost, 2),
            cost_saved_usd=round(cost_saved, 2),
            estimated_delay_hours=round(delay, 1),
            estimated_arrival=round(eta, 1),
            co2_saved_kg=round(co2_saved, 2),
            utilization_gain=round(space_used, 3),
            feasible=True,
        )

    def _normalize_and_score(self, options: list[RecoveryOption], s: Shipment, w: dict) -> None:
        if len(options) == 1:
            opt = options[0]
            norm = {
                "cost": 1.0,
                "time": 1.0,
                "util": 1.0,
                "co2": 1.0,
            }
            priority_w = PRIORITY_WEIGHTS.get(s.priority, 0.25)
            self._apply_score(opt, norm, w, priority_w)
            return

        # Find max/min for normalization
        costs = [o.cost_saved_usd for o in options]
        times = [o.estimated_delay_hours for o in options]
        utils = [o.utilization_gain for o in options]
        co2s = [o.co2_saved_kg for o in options]

        cost_range = max(costs) - min(costs)
        time_range = max(times) - min(times)
        util_range = max(utils) - min(utils)
        co2_range = max(co2s) - min(co2s)

        priority_w = PRIORITY_WEIGHTS.get(s.priority, 0.25)

        for opt in options:
            norm = {}
            # Cost: higher savings = better = higher score
            norm["cost"] = (opt.cost_saved_usd - min(costs)) / cost_range if cost_range > 0 else 1.0
            # Time: lower delay = better. Invert.
            norm["time"] = 1.0 - ((opt.estimated_delay_hours - min(times)) / time_range) if time_range > 0 else 1.0
            norm["time"] = max(0.0, min(1.0, norm["time"]))
            # Utilization: higher = better
            norm["util"] = (opt.utilization_gain - min(utils)) / util_range if util_range > 0 else 1.0
            # CO2: higher savings = better
            norm["co2"] = (opt.co2_saved_kg - min(co2s)) / co2_range if co2_range > 0 else 1.0
            self._apply_score(opt, norm, w, priority_w)

    def _apply_score(self, opt: RecoveryOption, norm: dict, w: dict, priority_w: float) -> None:
        w_cost = w.get("w_cost", 0.30)
        w_time = w.get("w_time", 0.25)
        w_util = w.get("w_util", 0.20)
        w_priority = w.get("w_priority", 0.15)
        w_co2 = w.get("w_co2", 0.10)

        contributions = {
            "cost": w_cost * norm["cost"],
            "time": w_time * norm["time"],
            "util": w_util * norm["util"],
            "priority": w_priority * priority_w,
            "co2": w_co2 * norm["co2"],
        }
        score = sum(contributions.values())

        opt.score = round(score, 4)
        opt.score_breakdown = ScoreBreakdown(
            raw_values={
                "cost_saved": opt.cost_saved_usd,
                "delay_hours": opt.estimated_delay_hours,
                "utilization": opt.utilization_gain,
                "co2_saved": opt.co2_saved_kg,
                "priority_weight": priority_w,
            },
            normalized_values=norm,
            weights=w,
            weighted_contributions=contributions,
            final_score=score,
        )

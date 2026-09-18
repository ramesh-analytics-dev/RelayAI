"""Decision engine — ranks recovery options by score and generates explanations."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.models import RecoveryOption, Shipment

if TYPE_CHECKING:
    from app.services.state import AppState


class DecisionEngine:
    """Sorts options by score, assigns ranks, generates explanations."""

    def __init__(self, state: "AppState"):
        self.state = state

    def decide(self, shipment: Shipment, options: list[RecoveryOption]) -> list[RecoveryOption]:
        state = self.state
        # Sort descending by score
        ranked = sorted(options, key=lambda o: o.score, reverse=True)
        # Assign ranks
        for i, opt in enumerate(ranked):
            opt.rank = i + 1
            opt.explanation = self._explain(shipment, opt)
        # Return top 3
        return ranked[:3]

    def _explain(self, s: Shipment, opt: RecoveryOption) -> str:
        state = self.state
        v = state.vehicles_by_id.get(opt.vehicle_ids[0])
        v_label = "vehicle"
        if v:
            type_names = {"TRUCK": "Truck", "VAN": "Van", "RAIL": "Train", "AIR": "Plane"}
            v_label = f"{type_names.get(v.type.value, v.type.value)} {v.id.replace('V-', 'V')}"

        parts: list[str] = []
        parts.append(
            f"{v_label} has {opt.utilization_gain * 100:.0f}% space available"
            if opt.utilization_gain <= 1
            else f"{v_label} can accommodate your package"
        )

        if opt.piggyback_mode.value == "MULTI_HOP" and opt.transfer_hub_ids:
            transfer_hub = state.hubs_by_id.get(opt.transfer_hub_ids[0])
            if transfer_hub:
                parts.append(f"transfers through {transfer_hub.name}")

        parts.append(f"Your package weighs {s.weight_kg:.0f}kg, so it fits")

        if opt.estimated_delay_hours < 0:
            parts.append(f"It arrives {abs(opt.estimated_delay_hours):.1f} hours early")
        elif opt.estimated_delay_hours == 0:
            parts.append("It arrives right on time")
        else:
            parts.append(f"It arrives {opt.estimated_delay_hours:.1f} hours late")

        if opt.cost_saved_usd > 0:
            parts.append(f"You save ${opt.cost_saved_usd:.0f} compared to a dedicated truck")
        else:
            parts.append(f"It costs ${opt.estimated_cost_usd:.0f}")

        if opt.co2_saved_kg > 0:
            parts.append(f"You save {opt.co2_saved_kg:.1f}kg of CO2")

        return ". ".join(parts) + "."

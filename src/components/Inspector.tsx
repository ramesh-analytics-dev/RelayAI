import { useEffect } from "react";
import type { Shipment, RecoveryOption } from "../types";
import type { EngineState } from "../engine/engine";

interface InspectorProps {
  engine: EngineState;
  selectedShipment: Shipment | null;
  rescuePlans: RecoveryOption[];
  loadingPlans: boolean;
  recovering: boolean;
  onLoadPlans: (shipmentId: string) => void;
  onChoosePlan: (shipmentId: string, rank: number) => void;
  onClose: () => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  PLATINUM: "PLATINUM",
  GOLD: "GOLD",
  SILVER: "SILVER",
  STANDARD: "STANDARD",
};

const PRIORITY_COLORS: Record<string, string> = {
  PLATINUM: "#e5e7eb",
  GOLD: "#d29922",
  SILVER: "#94a3b8",
  STANDARD: "#6e7681",
};

const VEHICLE_LABELS: Record<string, string> = {
  TRUCK: "Truck",
  VAN: "Van",
  RAIL: "Train",
  AIR: "Plane",
};

const STRATEGY_ICONS: Record<string, string> = {
  DIRECT: "→",
  CONSOLIDATION: "⊕",
  MULTI_HOP: "⇢",
  REPOSITIONING: "↺",
};

const FALLBACK_LABEL = "TRANSMIT TO NEAREST NODE";

export function Inspector({
  engine,
  selectedShipment,
  rescuePlans,
  loadingPlans,
  recovering,
  onLoadPlans,
  onChoosePlan,
  onClose,
}: InspectorProps) {
  useEffect(() => {
    if (selectedShipment && selectedShipment.status === "MISPLACED" && rescuePlans.length === 0 && !loadingPlans) {
      onLoadPlans(selectedShipment.id);
    }
  }, [selectedShipment, rescuePlans.length, loadingPlans, onLoadPlans]);

  if (!selectedShipment) {
    return (
      <aside style={inspectorStyle}>
        <div style={{ padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "16px", opacity: 0.3 }}>{"📦"}</div>
          <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>
            No package selected
          </h3>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
            Click a red package on the map
            <br />
            to see what happened
            <br />
            and how we can rescue it.
          </p>
        </div>
      </aside>
    );
  }

  const destHub = engine.hubs.find((h) => h.id === selectedShipment.destination_hub_id);
  const originHub = engine.hubs.find((h) => h.id === selectedShipment.origin_hub_id);
  const pickupHub = selectedShipment.recovery_pickup_hub_id
    ? engine.hubs.find((h) => h.id === selectedShipment.recovery_pickup_hub_id)
    : null;
  const vehicle = selectedShipment.assigned_vehicle_id
    ? engine.vehicles.find((v) => v.id === selectedShipment.assigned_vehicle_id)
    : null;
  const detectionEvent = engine.events.find((e) => e.shipment_id === selectedShipment.id);

  const statusColor =
    selectedShipment.status === "MISPLACED" ? "var(--color-red)" :
    selectedShipment.status === "RECOVERING" ? "var(--color-blue)" :
    selectedShipment.status === "RECOVERED" ? "var(--color-green)" :
    selectedShipment.status === "DELIVERED" ? "var(--color-gray)" :
    "var(--text-secondary)";

  const statusLabel =
    selectedShipment.status === "MISPLACED" ? "LOST" :
    selectedShipment.status === "RECOVERING" ? "BEING RESCUED" :
    selectedShipment.status === "RECOVERED" ? "RESCUED" :
    selectedShipment.status === "DELIVERED" ? "DELIVERED" :
    "IN TRANSIT";

  return (
    <aside style={inspectorStyle}>
      <div style={{ overflowY: "auto", height: "100%", padding: "20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
              PACKAGE {selectedShipment.id}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
              <span style={{ fontSize: "12px", fontWeight: 600, color: statusColor, letterSpacing: "0.05em" }}>
                {statusLabel}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: "3px",
                  background: `${PRIORITY_COLORS[selectedShipment.priority] || "#6e7681"}22`,
                  color: PRIORITY_COLORS[selectedShipment.priority] || "#6e7681",
                }}
              >
                {PRIORITY_LABELS[selectedShipment.priority] || selectedShipment.priority}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "18px",
              padding: "4px",
            }}
            aria-label="Close inspector"
          >
            {"×"}
          </button>
        </div>

        {/* Why it's lost */}
        {detectionEvent && (
          <div style={{ marginBottom: "16px", padding: "12px", background: "rgba(248, 81, 73, 0.08)", borderRadius: "var(--radius)", border: "1px solid rgba(248, 81, 73, 0.2)" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-red)", letterSpacing: "0.08em", marginBottom: "6px" }}>
              WHY IT'S LOST
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.5 }}>
              {detectionEvent.detection_reason}
            </p>
            <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em" }}>SEVERITY</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: "3px",
                background: detectionEvent.severity === "HIGH" ? "rgba(248,81,73,0.15)" : "rgba(210,153,34,0.15)",
                color: detectionEvent.severity === "HIGH" ? "var(--color-red)" : "var(--color-amber)",
              }}>
                {detectionEvent.severity}
              </span>
            </div>
          </div>
        )}

        {/* Journey visualization */}
        {selectedShipment.status === "MISPLACED" && (
          <div style={{ marginBottom: "20px", padding: "14px", background: "var(--bg-surface-2)", borderRadius: "var(--radius)" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.08em", marginBottom: "12px" }}>
              PACKAGE JOURNEY
            </div>
            <JourneyFlow
              originName={originHub?.name || selectedShipment.origin_hub_id}
              currentName={pickupHub?.name || "Current location"}
              destName={destHub?.name || selectedShipment.destination_hub_id}
              isLost
            />
          </div>
        )}

        {/* Package details */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <DetailItem label="From" value={originHub?.name || selectedShipment.origin_hub_id} />
            <DetailItem label="Destination" value={destHub?.name || selectedShipment.destination_hub_id} />
            <DetailItem label="Weight" value={`${selectedShipment.weight_kg.toFixed(1)} kg`} />
            <DetailItem label="Priority" value={PRIORITY_LABELS[selectedShipment.priority] || selectedShipment.priority} />
            <DetailItem label="Must arrive by" value={`Day ${Math.floor(selectedShipment.deadline / 24) + 1}, ${Math.floor(selectedShipment.deadline % 24)}:00`} />
            <DetailItem label="Current vehicle" value={vehicle ? `${VEHICLE_LABELS[vehicle.type] || vehicle.type} ${vehicle.id}` : "Unassigned"} />
          </div>
        </div>

        {/* Rescue plans */}
        {selectedShipment.status === "MISPLACED" && (
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.08em", marginBottom: "12px" }}>
              {rescuePlans.length > 0 ? `${rescuePlans.length} WAYS TO RESCUE THIS PACKAGE` : loadingPlans ? "FINDING RESCUE PLANS..." : "NO RESCUE PLANS AVAILABLE"}
            </div>

            {/* Pipeline indicator */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
              {["DETECT", "SEARCH", "MATCH", "EVALUATE", "RANK", "DECIDE"].map((stage, i) => (
                <div key={stage} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <div style={{
                    fontSize: 8, fontWeight: 700, padding: "3px 6px", borderRadius: "3px", letterSpacing: "0.04em",
                    background: rescuePlans.length > 0 ? "rgba(63,185,80,0.12)" : i === 0 && loadingPlans ? "rgba(47,129,247,0.12)" : "var(--bg-surface-2)",
                    color: rescuePlans.length > 0 ? "var(--color-green)" : i === 0 && loadingPlans ? "var(--accent-blue)" : "var(--text-muted)",
                  }}>
                    {stage}
                  </div>
                  {i < 5 && <span style={{ fontSize: 8, color: "var(--text-muted)" }}>→</span>}
                </div>
              ))}
            </div>

            {/* Plan cards */}
            {loadingPlans && rescuePlans.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton" style={{ height: "200px", borderRadius: "var(--radius)" }} />
                ))}
              </div>
            )}

            {rescuePlans.map((plan, idx) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                engine={engine}
                shipment={selectedShipment}
                rank={idx + 1}
                isBest={idx === 0}
                recovering={recovering}
                onChoose={() => onChoosePlan(selectedShipment.id, plan.rank)}
              />
            ))}

            {rescuePlans.length === 0 && !loadingPlans && (
              <div style={{ padding: "20px", textAlign: "center", background: "var(--bg-surface-2)", borderRadius: "var(--radius)" }}>
                <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  Searching for the nearest reachable hub to move this package forward.
                </p>
              </div>
            )}
          </div>
        )}

        {selectedShipment.status === "RECOVERING" && (
          <div style={{ padding: "20px", textAlign: "center", background: "rgba(47, 129, 247, 0.08)", borderRadius: "var(--radius)", border: "1px solid rgba(47, 129, 247, 0.2)" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>{"🚛"}</div>
            <p style={{ fontSize: "13px", color: "var(--accent-blue)", fontWeight: 600 }}>
              This package is being rescued.
            </p>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
              Watch it move toward its destination on the map.
            </p>
          </div>
        )}

        {selectedShipment.status === "RECOVERED" && (
          <div style={{ padding: "20px", textAlign: "center", background: "rgba(63, 185, 80, 0.08)", borderRadius: "var(--radius)", border: "1px solid rgba(63, 185, 80, 0.2)" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>{"✓"}</div>
            <p style={{ fontSize: "13px", color: "var(--color-green)", fontWeight: 600 }}>
              This package has been rescued and delivered.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function JourneyFlow({ originName, currentName, destName, isLost }: { originName: string; currentName: string; destName: string; isLost: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      <FlowNode label="Origin" value={originName} color="var(--color-green)" />
      <FlowArrow />
      <FlowNode label={isLost ? "Lost at" : "Current"} value={currentName} color="var(--color-red)" />
      <FlowArrow dashed />
      <FlowNode label="Destination" value={destName} color="var(--color-amber)" />
    </div>
  );
}

function FlowNode({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: "6px 10px", background: "var(--bg-surface)", borderRadius: "6px",
      border: `1px solid ${color}44`, minWidth: 0, flex: 1,
    }}>
      <div style={{ fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

function FlowArrow({ dashed }: { dashed?: boolean }) {
  return (
    <div style={{
      fontSize: 14, color: dashed ? "var(--color-red)" : "var(--text-muted)", flexShrink: 0,
      opacity: dashed ? 0.6 : 1,
    }}>
      {dashed ? "⇢" : "→"}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "2px", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}

function PlanCard({ plan, engine, shipment, rank, isBest, recovering, onChoose }: {
  plan: RecoveryOption;
  engine: EngineState;
  shipment: Shipment;
  rank: number;
  isBest: boolean;
  recovering: boolean;
  onChoose: () => void;
}) {
  const vehicleLabel = (vid: string) => {
    const v = engine.vehicles_by_id[vid];
    if (!v) return vid;
    return `${VEHICLE_LABELS[v.type] || v.type} ${v.id.replace("V-", "V")}`;
  };

  const transferHubNames = plan.transfer_hub_ids.map(hid => {
    const h = engine.hubs_by_id[hid];
    return h ? h.name : hid;
  });

  const pickupHubName = shipment.recovery_pickup_hub_id
    ? (engine.hubs_by_id[shipment.recovery_pickup_hub_id]?.name || shipment.recovery_pickup_hub_id)
    : "Current location";
  const destHubName = engine.hubs_by_id[shipment.destination_hub_id]?.name || shipment.destination_hub_id;

  const pathNodes = [pickupHubName, ...transferHubNames, destHubName];

  const scoreBreakdown = plan.score_breakdown;
  const contributions = scoreBreakdown.weighted_contributions;
  const contribEntries = Object.entries(contributions) as [string, number][];

  const rankReasons: string[] = [];
  if (plan.estimated_delay_hours <= 0) rankReasons.push("Arrives on time or early");
  else if (isBest) rankReasons.push(`Lowest delay among options`);
  if (plan.cost_saved_usd > 0 && isBest) rankReasons.push("Best cost savings");
  if (plan.co2_saved_kg > 0 && isBest) rankReasons.push("Lowest CO₂ emissions");
  if (plan.transfer_hub_ids.length === 0) rankReasons.push("No transfers needed");
  if (plan.utilization_gain < 0.5) rankReasons.push("Good capacity available");
  if (plan.transfer_hub_ids.length > 0) rankReasons.push(`${plan.transfer_hub_ids.length} transfer${plan.transfer_hub_ids.length > 1 ? "s" : ""} required`);

  const routeColor = isBest ? "var(--color-green)" : "var(--color-amber)";

  return (
    <div
      style={{
        marginBottom: "12px",
        padding: "16px",
        background: "var(--bg-surface-2)",
        borderRadius: "var(--radius)",
        border: isBest ? "1px solid var(--accent-blue)" : "1px solid var(--border-thin)",
        transition: "all 0.3s",
        animation: "slide-up 0.3s ease",
        position: "relative",
      }}
    >
      {/* Rank badge */}
      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 6 }}>
        {isBest && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-blue)", letterSpacing: "0.08em" }}>
            BEST MATCH
          </span>
        )}
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: "10px",
          background: isBest ? "var(--accent-blue)" : "var(--bg-surface)",
          color: isBest ? "white" : "var(--text-muted)",
        }}>
          #{rank}
        </span>
      </div>

      {/* Strategy header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingRight: 80 }}>
        <span style={{ fontSize: 18, color: routeColor, fontWeight: 700 }}>{STRATEGY_ICONS[plan.piggyback_mode] || "→"}</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
          {plan.strategy_label}
        </div>
      </div>

      {/* Recovery path visualization */}
      <div style={{ marginBottom: 14, padding: "12px", background: "var(--bg-surface)", borderRadius: "6px" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 8 }}>
          RECOVERY PATH
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
          {pathNodes.map((node, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {i > 0 && (
                <span style={{ fontSize: 11, color: routeColor }}>
                  {plan.piggyback_mode === "MULTI_HOP" && i < pathNodes.length - 1 ? "⇢" : "→"}
                </span>
              )}
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: i === 0 ? "var(--color-red)" : i === pathNodes.length - 1 ? "var(--color-amber)" : "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}>
                {node}
              </span>
            </div>
          ))}
        </div>
        {/* Vehicle info */}
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {plan.vehicle_ids.length > 0 ? (
            plan.vehicle_ids.map((vid, i) => (
              <span key={vid} style={{
                fontSize: 10, padding: "2px 8px", borderRadius: "4px",
                background: "var(--bg-surface-2)", color: "var(--accent-blue)",
              }}>
                {i > 0 && "Transfer → "}{vehicleLabel(vid)}
              </span>
            ))
          ) : (
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: "4px",
              background: "rgba(210,153,34,0.12)", color: "var(--color-amber)",
            }}>
              Dedicated transit — no vehicle needed
            </span>
          )}
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
        <Metric icon="💰" value={`$${plan.cost_saved_usd.toFixed(0)}`} label="MONEY SAVED" color="var(--color-green)" />
        <Metric
          icon="⏱"
          value={plan.estimated_delay_hours < 0 ? `${Math.abs(plan.estimated_delay_hours).toFixed(1)}h early` : `${plan.estimated_delay_hours.toFixed(1)}h late`}
          label="DELAY"
          color={plan.estimated_delay_hours <= 0 ? "var(--color-green)" : "var(--color-amber)"}
        />
        <Metric icon="📦" value={`${(plan.utilization_gain * 100).toFixed(0)}%`} label="SPACE USED" color="var(--accent-blue)" />
        <Metric icon="🌱" value={`${plan.co2_saved_kg.toFixed(1)} kg`} label="LESS POLLUTION" color="var(--color-green)" />
      </div>

      {/* Estimated arrival */}
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Est. arrival</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", fontFamily: "monospace" }}>
          Day {Math.floor(plan.estimated_arrival / 24) + 1}, {Math.floor(plan.estimated_arrival % 24)}:00
        </span>
      </div>

      {/* Score breakdown bar */}
      <div style={{ marginBottom: 14, padding: "10px 12px", background: "var(--bg-surface)", borderRadius: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em" }}>ROUTE SCORE</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: isBest ? "var(--color-green)" : "var(--color-amber)" }}>
            {(plan.score * 100).toFixed(1)}
          </span>
        </div>
        {/* Score contributions bar */}
        <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "var(--bg-surface-2)" }}>
          {contribEntries.map(([key, val]) => {
            const colors: Record<string, string> = {
              cost: "var(--color-green)",
              time: "var(--accent-blue)",
              util: "#8b949e",
              priority: "var(--color-amber)",
              co2: "#3fb95088",
            };
            const pct = plan.score > 0 ? (val / plan.score) * 100 : 0;
            return (
              <div key={key} style={{
                width: `${pct}%`,
                background: colors[key] || "#6e7681",
                transition: "width 0.4s ease",
              }} />
            );
          })}
        </div>
        {/* Contribution labels */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 12px", marginTop: 8 }}>
          {contribEntries.map(([key, val]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 6, height: 6, borderRadius: 2,
                background: ({
                  cost: "var(--color-green)", time: "var(--accent-blue)", util: "#8b949e",
                  priority: "var(--color-amber)", co2: "#3fb95088",
                } as Record<string, string>)[key] || "#6e7681",
              }} />
              <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "capitalize" }}>{key}</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: "var(--text-secondary)" }}>
                {((val / plan.score) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Why this route was recommended */}
      <div style={{ marginBottom: 14, padding: "10px 12px", background: isBest ? "rgba(63,185,80,0.06)" : "transparent", borderRadius: "6px", border: isBest ? "1px solid rgba(63,185,80,0.15)" : "1px solid var(--border-thin)" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: isBest ? "var(--color-green)" : "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 6 }}>
          {isBest ? "WHY THIS IS RECOMMENDED" : "HOW IT COMPARES"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {rankReasons.map((reason, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ fontSize: 10, color: isBest ? "var(--color-green)" : "var(--text-muted)", flexShrink: 0 }}>
                {isBest ? "✓" : "•"}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>{reason}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Full explanation */}
      <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "14px" }}>
        {plan.explanation}
      </p>

      <button
        onClick={onChoose}
        disabled={recovering}
        style={{
          width: "100%",
          padding: "10px",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          border: "none",
          background: isBest ? "var(--accent-blue)" : "var(--bg-surface)",
          color: isBest ? "white" : "var(--text-secondary)",
          borderRadius: "var(--radius)",
          cursor: recovering ? "not-allowed" : "pointer",
          opacity: recovering ? 0.5 : 1,
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          if (!recovering) e.currentTarget.style.transform = "scale(1.02)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        {recovering ? "RESCUING..." : isBest ? "CHOOSE RECOMMENDED PLAN" : "CHOOSE THIS PLAN"}
      </button>
    </div>
  );
}

function Metric({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <span style={{ fontSize: "12px" }}>{icon}</span>
        <span style={{ fontSize: "14px", fontWeight: 700, color }}>{value}</span>
      </div>
      <div style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

const inspectorStyle: React.CSSProperties = {
  width: "380px",
  background: "var(--bg-surface)",
  borderLeft: "1px solid var(--border-thin)",
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  overflow: "hidden",
};

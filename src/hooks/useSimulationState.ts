import { useState, useEffect, useCallback, useRef } from "react";
import type { RecoveryOption } from "../types";
import {
  EngineState, createEngine, fullTick, optimize, recover,
  closeHub, resetEngine, updateMetrics,
} from "../engine/engine";

export function useSimulationState() {
  const engineRef = useRef<EngineState>(createEngine());
  const [stateVersion, setStateVersion] = useState(0);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [rescuePlans, setRescuePlans] = useState<RecoveryOption[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [toast, setToast] = useState<{ message: string; details: string[] } | null>(null);
  const [chaosActive, setChaosActive] = useState(false);
  const [chaosData, setChaosData] = useState<{ hubName: string; affectedCount: number } | null>(null);
  const [tourStep, setTourStep] = useState(0);
  const [showTour, setShowTour] = useState(true);
  const toastTimer = useRef<number | null>(null);

  // Tick loop
  useEffect(() => {
    const interval = setInterval(() => {
      const eng = engineRef.current;
      fullTick(eng);
      setStateVersion(v => v + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const forceUpdate = useCallback(() => setStateVersion(v => v + 1), []);

  const selectShipment = useCallback((id: string | null) => {
    setSelectedShipmentId(id);
    setRescuePlans([]);
    if (id) setShowTour(false);
  }, []);

  const loadRescuePlans = useCallback((shipmentId: string) => {
    setLoadingPlans(true);
    try {
      const plans = optimize(engineRef.current, shipmentId);
      setRescuePlans(plans);
    } catch {
      setRescuePlans([]);
    } finally {
      setLoadingPlans(false);
    }
  }, []);

  const choosePlan = useCallback((shipmentId: string, rank: number) => {
    setRecovering(true);
    const result = recover(engineRef.current, shipmentId, rank);
    if (result.success && result.option) {
      const opt = result.option;
      const details: string[] = [];
      if (opt.cost_saved_usd > 0) details.push(`$${opt.cost_saved_usd.toFixed(0)} saved`);
      if (opt.estimated_delay_hours < 0) details.push(`Arrives ${Math.abs(opt.estimated_delay_hours).toFixed(1)} hours early`);
      if (opt.co2_saved_kg > 0) details.push(`${opt.co2_saved_kg.toFixed(1)} kg less pollution`);
      setToast({ message: "Package rescued", details });
      setRescuePlans([]);
      setSelectedShipmentId(null);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 5000);
    } else {
      setToast({ message: "Recovery failed", details: [result.error?.message || "Unknown error"] });
    }
    forceUpdate();
    setRecovering(false);
  }, [forceUpdate]);

  const triggerChaos = useCallback((hubId?: string) => {
    setChaosActive(true);
    const result = closeHub(engineRef.current, hubId);
    if (result.success) {
      setChaosData({ hubName: result.hub_name!, affectedCount: result.affected_count! });
      setTimeout(() => setChaosActive(false), 3000);
    } else {
      setChaosActive(false);
    }
    forceUpdate();
  }, [forceUpdate]);

  const simControl = useCallback((action: string, speedMultiplier?: number) => {
    const eng = engineRef.current;
    if (action === "pause") eng.running = false;
    else if (action === "resume") eng.running = true;
    else if (action === "reset") {
      engineRef.current = resetEngine(eng);
      setSelectedShipmentId(null);
      setRescuePlans([]);
      setChaosData(null);
    } else if (action === "speed" && speedMultiplier) {
      eng.speed_multiplier = speedMultiplier;
    }
    forceUpdate();
  }, [forceUpdate]);

  const eng = engineRef.current;
  const selectedShipment = eng.shipments.find(s => s.id === selectedShipmentId) || null;

  return {
    engine: eng,
    stateVersion,
    selectedShipmentId,
    selectedShipment,
    rescuePlans,
    loadingPlans,
    recovering,
    toast,
    chaosActive,
    chaosData,
    tourStep,
    showTour,
    selectShipment,
    loadRescuePlans,
    choosePlan,
    triggerChaos,
    simControl,
    setTourStep,
    setShowTour,
  };
}

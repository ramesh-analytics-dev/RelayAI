import { useSimulationState } from "./hooks/useSimulationState";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { MapView } from "./components/MapView";
import { Inspector } from "./components/Inspector";
import { Scoreboard } from "./components/Scoreboard";
import { EventFeed } from "./components/EventFeed";
import { ChaosOverlay } from "./components/ChaosOverlay";
import { Toast } from "./components/Toast";
import { Tour } from "./components/Tour";
import { NetworkOverview } from "./components/NetworkOverview";
import { Legend } from "./components/Legend";
import { useState } from "react";

export default function App() {
  const sim = useSimulationState();
  const [activeView, setActiveView] = useState<"network" | "events" | "chaos">("network");
  const [showLegend, setShowLegend] = useState(false);

  return (
    <div className="app-layout">
      <Header
        engine={sim.engine}
        onSimControl={sim.simControl}
      />
      <div className="main-area">
        <Sidebar activeView={activeView} onNavigate={setActiveView} />
        <div className="map-container">
          <MapView
            engine={sim.engine}
            selectedShipmentId={sim.selectedShipmentId}
            rescuePlans={sim.rescuePlans}
            onSelectShipment={sim.selectShipment}
          />
          {activeView === "network" && !sim.selectedShipmentId && (
            <NetworkOverview engine={sim.engine} />
          )}
          <Legend visible={showLegend} onToggle={() => setShowLegend(!showLegend)} />
        </div>
        <Inspector
          engine={sim.engine}
          selectedShipment={sim.selectedShipment}
          rescuePlans={sim.rescuePlans}
          loadingPlans={sim.loadingPlans}
          recovering={sim.recovering}
          onLoadPlans={sim.loadRescuePlans}
          onChoosePlan={sim.choosePlan}
          onClose={() => sim.selectShipment(null)}
        />
      </div>
      <Scoreboard metrics={sim.engine.metrics} />
      <EventFeed events={sim.engine.event_log} />
      <ChaosOverlay
        active={sim.chaosActive}
        data={sim.chaosData}
        onTrigger={sim.triggerChaos}
      />
      <Toast toast={sim.toast} />
      {sim.showTour && (
        <Tour
          step={sim.tourStep}
          onNext={() => sim.setTourStep(sim.tourStep + 1)}
          onSkip={() => sim.setShowTour(false)}
        />
      )}
    </div>
  );
}

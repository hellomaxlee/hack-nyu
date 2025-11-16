"use client";

import { Thread } from "@/components/assistant-ui/thread";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { useMapController } from "@/hooks/useMapController";
import SubwayMap from "@/components/SubwayMap";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { getStationIdByName } from "@/utils/stationUtils";
import { useEffect, useState, createContext, useContext, useCallback } from "react";

interface DashboardProps {
  latitude: number;
  longitude: number;
}

interface StationInfo {
  stop_name: string;
  "Daytime.Routes": string;
  Latitude: number;
  Longitude: number;
  primary_line: string;
  distance_miles?: number;
}

interface StationOnLinesResponse {
  closest_station: StationInfo[];
  lines: string[];
  stations_on_lines: StationInfo[];
}

// Create context for modal control
interface ModalContextType {
  openModal: () => void;
  showModalButton: boolean;
  setShowModalButton: (show: boolean) => void;
  setModalOpener: (opener: () => void) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModalContext = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModalContext must be used within ModalProvider");
  }
  return context;
};

export default function Dashboard({ latitude, longitude }: DashboardProps) {
  const [stationData, setStationData] = useState<StationOnLinesResponse | null>(null);
  const [showModalButton, setShowModalButton] = useState(false);
  const [modalOpener, setModalOpener] = useState<(() => void) | null>(null);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      body: {
        latitude,
        longitude,
      },
    }),
  });

  const { setMapRef, jumpToStation, selectLines, showAllLines } =
    useMapController();

  const openModal = useCallback(() => {
    if (modalOpener) {
      modalOpener();
    }
  }, [modalOpener]);

  const handleSetModalOpener = useCallback((opener: () => void) => {
    setModalOpener(() => opener);
  }, []);

  // Fetch station data from R API
  useEffect(() => {
    const fetchStationData = async () => {
      try {
        const response = await fetch(
          `http://localhost:8081/stations-on-lines?lat=${latitude}&lng=${longitude}`
        );
        if (response.ok) {
          const data = await response.json() as StationOnLinesResponse;
          setStationData(data);
          console.log("Station data:", data);
        }
      } catch (error) {
        console.error("Failed to fetch station data:", error);
      }
    };

    fetchStationData();
  }, [latitude, longitude]);

  const handleMapReady = () => {
    if (stationData) {
      // Use the closest station to jump to
      const closestStation = stationData.closest_station[0];
      if (closestStation) {
        const stationId = getStationIdByName(closestStation.stop_name);
        console.log("Jumping to closest station:", closestStation.stop_name);
        console.log("stationId", stationId);
        jumpToStation(stationId);
      }

      // Select the lines from the API response
      if (stationData.lines.length > 0) {
        console.log("Selecting lines:", stationData.lines);
        selectLines(stationData.lines);
      }
    } else {
      // Fallback to default behavior if data not loaded yet
      const stationId = getStationIdByName("Times Sq-42 St");
      selectLines(["2"]);
      console.log("stationId", stationId);
      jumpToStation(stationId);
    }
    console.log("User location:", { latitude, longitude });
  };

  return (
    <ModalContext.Provider value={{ openModal, showModalButton, setShowModalButton, setModalOpener: handleSetModalOpener }}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full w-full"
        >
          <ResizablePanel defaultSize={70} minSize={30} className="h-full relative">
            {/* @ts-ignore */}
            <SubwayMap ref={setMapRef} onMapReady={handleMapReady} />
            {showModalButton && (
              <button
                onClick={openModal}
                className="absolute bottom-6 right-6 z-50 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
              >
                View Report
              </button>
            )}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={30} minSize={20}>
            <Thread lines={stationData?.lines || []} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </AssistantRuntimeProvider>
    </ModalContext.Provider>
  );
}

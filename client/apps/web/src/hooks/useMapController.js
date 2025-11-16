import { useCallback, useRef } from "react";

export function useMapController() {
  const mapRef = useRef(null);

  const setMapRef = useCallback((ref) => {
    mapRef.current = ref;
  }, []);

  const jumpToStation = useCallback((stationId) => {
    if (mapRef.current?.jumpToStation) {
      mapRef.current.jumpToStation(stationId);
    } else {
      console.warn("Map reference not available");
    }
  }, []);

  const selectLines = useCallback((lineIds, clickCoordinates = null) => {
    if (mapRef.current?.selectLines) {
      mapRef.current.selectLines(lineIds, clickCoordinates);
    } else {
      console.warn("Map reference not available");
    }
  }, []);

  const showAllLines = useCallback(() => {
    if (mapRef.current?.showAllLines) {
      mapRef.current.showAllLines();
    } else {
      console.warn("Map reference not available");
    }
  }, []);

  return {
    setMapRef,
    jumpToStation,
    selectLines,
    showAllLines,
  };
}

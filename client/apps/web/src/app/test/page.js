"use client";

import dynamic from "next/dynamic";
import { useMapController } from "@/hooks/useMapController";

// Dynamic import to avoid SSR issues with Mapbox
const SubwayMap = dynamic(() => import("@/components/SubwayMap"), {
  ssr: false,
  loading: () => <div>Loading map...</div>,
});

export default function TestPage() {
  const { setMapRef, jumpToStation, selectLines, showAllLines } =
    useMapController();

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex" }}>
      {/* Map takes 75% width */}
      <div style={{ width: "75%", height: "100%" }}>
        <SubwayMap ref={setMapRef} />
      </div>

      {/* Control panel takes 25% width */}
      <div
        style={{
          width: "25%",
          height: "100%",
          padding: "20px",
          overflowY: "auto",
          backgroundColor: "#1a1a1a",
          color: "#ffffff",
        }}
      >
        <h2>Map Controls</h2>

        <div style={{ marginBottom: "20px" }}>
          <h3>Jump to Station</h3>
          <button
            onClick={() => jumpToStation("R16")}
            style={buttonStyle}
            type="button"
          >
            Times Square
          </button>
          <button
            onClick={() => jumpToStation("R20")}
            style={buttonStyle}
            type="button"
          >
            Union Square
          </button>
          <button
            onClick={() => jumpToStation("R11")}
            style={buttonStyle}
            type="button"
          >
            Lexington/59
          </button>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <h3>Select Lines</h3>
          <button
            onClick={() => selectLines(["1", "2", "3"])}
            style={buttonStyle}
            type="button"
          >
            Red Lines
          </button>
          <button
            onClick={() => selectLines(["A", "C", "E"])}
            style={buttonStyle}
            type="button"
          >
            Blue Lines
          </button>
          <button
            onClick={() => selectLines(["4", "5", "6"])}
            style={buttonStyle}
            type="button"
          >
            Green Lines
          </button>
          <button
            onClick={() => selectLines(["L"])}
            style={buttonStyle}
            type="button"
          >
            L Train Only
          </button>
          <button onClick={showAllLines} style={buttonStyle} type="button">
            Show All
          </button>
        </div>
      </div>
    </div>
  );
}

const buttonStyle = {
  display: "block",
  width: "100%",
  margin: "5px 0",
  padding: "10px",
  backgroundColor: "#333",
  color: "#fff",
  border: "1px solid #555",
  borderRadius: "4px",
  cursor: "pointer",
};

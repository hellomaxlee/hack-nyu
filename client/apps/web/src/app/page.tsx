"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { orpc } from "@/utils/orpc";
import { useMutation } from "@tanstack/react-query";

type RentDatasetEntry = {
  avg_rent_all: number | null;
  avg_rent_studio: number | null;
  avg_rent_1br: number | null;
  avg_rent_2br: number | null;
  avg_median_income: number | null;
  avg_pct_bachelors_plus: number | null;
  avg_pct_foreign_born: number | null;
  n_tracts: number;
};

type StationRentInfo = {
  Stop: string;
  ForLine: string | null;
  Long: number;
  Lat: number;
  RentDataset: RentDatasetEntry[];
};

const R_API = process.env.NEXT_PUBLIC_R_API_BASE || "http://localhost:8081";
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

// --- Types for /closest-station ---

// Each station row returned by R
type StationRow = {
  stop_name?: string;
  Stop?: string;
  Daytime_Routes?: string;
  "Daytime.Routes"?: string;
  Latitude: number;
  Longitude: number;
  distance_miles?: number;
};

// New multi-station response:
// R SHOULD RETURN:
//
// {
//   "query": { "latitude": <num>, "longitude": <num> },
//   "stations": [
//     { "stop_name": "...", "Latitude": ..., "Longitude": ..., "distance_miles": 0.02, "Daytime.Routes": "A C E" },
//     ...
//   ]
// }
//
// The first element in "stations" should be the closest station.
// Any station with distance_miles <= 0.25 should be included.
type MultiStationResponse = {
  query: {
    latitude: number;
    longitude: number;
  };
  stations: StationRow[];
};

// --- Helpers for NYC line logos ---

type LineStyle = {
  bg: string;
  text: string;
};

function getLineStyle(raw: string): LineStyle {
  const line = raw.trim().toUpperCase();

  if (["1", "2", "3"].includes(line)) {
    return { bg: "bg-red-600", text: "text-white" };
  }
  if (["4", "5", "6"].includes(line)) {
    return { bg: "bg-green-600", text: "text-white" };
  }
  if (["7"].includes(line)) {
    return { bg: "bg-purple-600", text: "text-white" };
  }
  if (["A", "C", "E"].includes(line)) {
    return { bg: "bg-blue-600", text: "text-white" };
  }
  if (["B", "D", "F", "M"].includes(line)) {
    return { bg: "bg-orange-500", text: "text-white" };
  }
  if (["N", "Q", "R", "W"].includes(line)) {
    return { bg: "bg-yellow-400", text: "text-black" };
  }
  if (["G"].includes(line)) {
    return { bg: "bg-lime-500", text: "text-black" };
  }
  if (["J", "Z"].includes(line)) {
    return { bg: "bg-amber-700", text: "text-white" };
  }
  if (["L"].includes(line)) {
    return { bg: "bg-zinc-500", text: "text-white" };
  }
  if (["S"].includes(line)) {
    return { bg: "bg-slate-700", text: "text-white" };
  }

  return { bg: "bg-sky-600", text: "text-white" };
}

// All NYC subway lines for the background animation
const ALL_LINES = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "A",
  "C",
  "E",
  "B",
  "D",
  "F",
  "M",
  "N",
  "Q",
  "R",
  "W",
  "G",
  "J",
  "Z",
  "L",
  "S",
];

// SAFE parser: handles string, array, numbers, etc., and de-dupes
function parseLines(forLine: any): string[] {
  if (!forLine) return [];

  let tokens: string[] = [];

  if (Array.isArray(forLine)) {
    tokens = forLine.flatMap((x) => String(x).split(/[,\s/|-]+/));
  } else {
    const raw = String(forLine);
    tokens = raw.split(/[,\s/|-]+/);
  }

  const cleaned = tokens
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return Array.from(new Set(cleaned));
}

// Pulls the route string from a StationRow in a safe way
function getRoutesField(row: StationRow): string | undefined {
  return row.Daytime_Routes ?? row["Daytime.Routes"];
}

// --- Foreground line pills (for each station's lines) ---

function LinePills({ routes }: { routes: any }) {
  const lines = parseLines(routes);
  if (lines.length === 0) {
    return <span className="text-xs text-slate-400">No line data</span>;
  }

  return (
    <div className="flex flex-wrap gap-2 mt-1.5">
      {lines.map((line) => {
        const style = getLineStyle(line);
        return (
          <span
            key={line}
            className={[
              "inline-flex items-center justify-center rounded-full",
              "h-7 w-7",
              "text-[0.75rem] font-bold",
              style.bg,
              style.text,
              "shadow-md shadow-black/40",
            ].join(" ")}
            style={{
              fontFamily: "Helvetica, Arial, system-ui, sans-serif",
            }}
          >
            {line.toUpperCase()}
          </span>
        );
      })}
    </div>
  );
}

// --- Animated falling line pills background ---

type FallingPillConfig = {
  id: number;
  line: string;
  left: number; // 0–100 (% of viewport width)
  duration: number; // seconds
  delay: number; // seconds
  scale: number; // size multiplier
};

function FallingPills() {
  const [configs, setConfigs] = useState<FallingPillConfig[] | null>(null);

  useEffect(() => {
    const count = 40;
    const arr: FallingPillConfig[] = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        id: i,
        line: ALL_LINES[i % ALL_LINES.length],
        left: Math.random() * 100, // 0–100%
        duration: 22 + Math.random() * 18, // 22–40s
        delay: -Math.random() * 30, // staggered
        scale: 0.8 + Math.random() * 0.8, // 0.8–1.6
      });
    }
    setConfigs(arr);
  }, []);

  // On the server (and before useEffect runs), render nothing
  if (!configs) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden -z-0">
      {configs.map((cfg) => {
        const styleDef = getLineStyle(cfg.line);
        return (
          <span
            key={cfg.id}
            className={[
              "falling-pill inline-flex items-center justify-center rounded-full",
              "font-bold",
              styleDef.bg,
              styleDef.text,
              "shadow-sm shadow-black/20",
              "opacity-30",
            ].join(" ")}
            style={{
              left: `${cfg.left}%`,
              animationDuration: `${cfg.duration}s`,
              animationDelay: `${cfg.delay}s`,
              width: `${1.8 * cfg.scale}rem`,
              height: `${1.8 * cfg.scale}rem`,
              fontSize: `${0.7 * cfg.scale}rem`,
              fontFamily: "Helvetica, Arial, system-ui, sans-serif",
            }}
          >
            {cfg.line}
          </span>
        );
      })}
    </div>
  );
}

// --- Page component ---

export default function Page() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<any>(null);

  const [address, setAddress] = useState("");
  const [formattedAddress, setFormattedAddress] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  const [stationData, setStationData] = useState<MultiStationResponse | null>(
    null
  );

  const [error, setError] = useState<string | null>(null);
  const [loadingR, setLoadingR] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);

  // PowerPoint generation mutation
  const { mutate: generateReport, isPending: isGeneratingReport } = useMutation(
    orpc.powerpoint.createPlan.mutationOptions({
      onSuccess: (data) => {
        console.log("Report generated successfully:", data);
        setReportGenerated(true);
      },
      onError: (error) => {
        console.error("Error generating report:", error);
        setError(error.message || "Failed to generate report");
      },
    }),
  );

  // Initialize Google Places Autocomplete
  useEffect(() => {
    if (!googleReady) return;
    if (!inputRef.current) return;

    const google = (window as any).google;
    if (!google) return;

    autocompleteRef.current = new google.maps.places.Autocomplete(
      inputRef.current,
      {
        types: ["geocode"],
        fields: ["formatted_address", "geometry"],
      },
    );

    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current.getPlace();

      if (!place.geometry || !place.geometry.location) {
        setError("No coordinates found for that location.");
        return;
      }

      const latVal = place.geometry.location.lat();
      const lngVal = place.geometry.location.lng();

      // Call /closest-station immediately on selection
      callR(latVal, lngVal);
    });
  }, [googleReady]);

  // Call Plumber API -> /closest-station
  async function callR(latVal: number, lngVal: number) {
    setLoadingR(true);
    setStationData(null);
    setError(null);

    // Save the coordinates
    setLat(latVal);
    setLng(lngVal);

    try {
      const res = await fetch(
        `${R_API}/closest-station?lat=${latVal}&lng=${lngVal}`
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Non-200 response from R API");
      }
      const data = (await res.json()) as MultiStationResponse;
      setStationData(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "R API call failed");
    } finally {
      setLoadingR(false);
    }
  }

  // Handle clicking on the closest station card
  function handleStationClick() {
    if (!closestStation || lat === null || lng === null) return;

    const stationName = closestStation.stop_name || closestStation.Stop || "Unknown station";
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      station: stationName,
    });

    router.push(`/chat?${params.toString()}`);
  }

  // Convenience: unpack stations list
  const stations: StationRow[] = stationData?.stations ?? [];
  const closestStation: StationRow | null =
    stations.length > 0 ? stations[0] : null;

  const nearbyOthers: StationRow[] =
    stations.length > 1
      ? stations.slice(1).filter((s) => {
        if (typeof s.distance_miles !== "number") return false;
        return s.distance_miles <= 0.25 + 1e-6;
      })
      : [];

  const closestName =
    closestStation?.stop_name || closestStation?.Stop || "Unknown station";

  const closestRoutes = closestStation
    ? getRoutesField(closestStation)
    : undefined;

  return (
    <>
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 text-slate-50 flex items-center">
        {/* Google Maps script */}
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => setGoogleReady(true)}
        />

        {/* Animated falling pills background */}
        <FallingPills />

        {/* Foreground content */}
        <main className="relative z-10 mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 md:py-12">
          <section className="rounded-3xl bg-slate-900/70 p-5 shadow-xl shadow-sky-950/40 backdrop-blur-lg border border-slate-800/80">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">
              StationScope
            </h1>
            <p className="text-sm text-slate-300 max-w-xl">
              Type an address in New York City to find your next dream apartment
              near the subway! Powered by Google Places Autocomplete and a
              custom R backend analyzing rent data around subway stations.
            </p>
            <div className="mt-5 space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-300">
                Address
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
                  placeholder="Start typing an address…"
                  style={{
                    fontFamily:
                      "system-ui, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif",
                  }}
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="rounded-2xl border border-red-500/60 bg-red-950/60 px-4 py-3 text-sm text-red-100 shadow-lg shadow-red-900/40">
              <b className="font-semibold">Error:</b> <span>{error}</span>
            </div>
          )}

          {loadingR && (
            <div className="rounded-2xl border border-sky-500/40 bg-sky-950/40 px-4 py-3 text-sm text-sky-100 shadow-lg shadow-sky-900/40">
              Finding stations near this address…
            </div>
          )}

          {closestStation && (
            <section
              onClick={handleStationClick}
              className="rounded-3xl bg-sky-900/40 p-5 shadow-xl shadow-sky-950/40 border border-sky-500/40 backdrop-blur-md cursor-pointer hover:bg-sky-900/60 hover:border-sky-400/60 transition-all duration-200"
            >
              <p className="text-[0.7rem] uppercase tracking-[0.25em] text-sky-200 mb-1">
                Closest subway station (Click to chat)
              </p>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xl font-semibold leading-tight">
                    {closestName}
                  </p>
                  {formattedAddress && (
                    <p className="text-xs text-sky-100 mt-1">
                      Matched for:{" "}
                      <span className="font-medium">{formattedAddress}</span>
                    </p>
                  )}
                  {typeof closestStation.distance_miles === "number" && (
                    <p className="text-[0.7rem] text-sky-100 mt-1">
                      ~{closestStation.distance_miles.toFixed(2)} miles from
                      input point
                    </p>
                  )}
                </div>
                <div className="mt-2 md:mt-0">
                  <LinePills routes={closestRoutes} />
                </div>
              </div>
            </section>
          )}

          {nearbyOthers.length > 0 && (
            <section className="rounded-3xl bg-slate-900/60 p-5 shadow-xl shadow-sky-950/30 border border-slate-800/80 backdrop-blur-md">
              <p className="text-[0.7rem] uppercase tracking-[0.25em] text-slate-200 mb-3">
                Other stations nearby
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {nearbyOthers.map((st, idx) => {
                  const name = st.stop_name || st.Stop || `Station ${idx + 1}`;
                  const routes = getRoutesField(st);
                  return (
                    <div
                      key={`${name}-${idx}`}
                      className="rounded-2xl border border-slate-700/80 bg-slate-950/60 px-4 py-3 flex flex-col justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold leading-snug">
                          {name}
                        </p>
                        {typeof st.distance_miles === "number" && (
                          <p className="text-[0.7rem] text-slate-300 mt-1">
                            ~{st.distance_miles.toFixed(2)} miles away
                          </p>
                        )}
                      </div>
                      <div className="mt-2">
                        <LinePills routes={routes} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Global styles for falling animation */}
      <style jsx global>{`
        @keyframes pillFall {
          0% {
            transform: translateY(-3rem);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            transform: translateY(110vh);
            opacity: 0;
          }
        }

        .falling-pill {
          position: absolute;
          top: -3rem;
          animation-name: pillFall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform, opacity;
        }
      `}</style>
    </>
  );
}

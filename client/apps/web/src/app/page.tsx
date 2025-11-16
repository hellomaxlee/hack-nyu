"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

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

export default function Page() {
  // Google Places states
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<any>(null);

  // Data states
  const [address, setAddress] = useState("");
  const [formattedAddress, setFormattedAddress] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [results, setResults] = useState<StationRentInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingR, setLoadingR] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);

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
      }
    );

    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current.getPlace();

      if (!place.geometry || !place.geometry.location) {
        setError("No coordinates found for that location.");
        return;
      }

      const latVal = place.geometry.location.lat();
      const lngVal = place.geometry.location.lng();

      setAddress(place.formatted_address || "");
      setFormattedAddress(place.formatted_address || "");
      setLat(latVal);
      setLng(lngVal);
      setError(null);

      callR(latVal, lngVal);
    });
  }, [googleReady]);

  // Call Plumber API
  async function callR(latVal: number, lngVal: number) {
    setLoadingR(true);
    setResults(null);
    setError(null);

    try {
      const res = await fetch(`${R_API}/predict?lat=${latVal}&lng=${lngVal}`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as StationRentInfo[];
      setResults(data);
    } catch (err: any) {
      setError(err.message || "R API call failed");
    } finally {
      setLoadingR(false);
    }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {/* Load Google Maps Places API */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`}
        strategy="afterInteractive"
        onLoad={() => setGoogleReady(true)}
      />

      <h1 className="text-2xl font-bold mb-4">NYC Subway Rent Explorer</h1>

      {/* Address input */}
      <div className="space-y-2 mb-6">
        <label className="text-sm font-medium">Enter an address:</label>
        <input
          ref={inputRef}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Start typing an address…"
        />
        <p className="text-xs text-gray-500">
          Suggestions come from Google Places Autocomplete.
        </p>
      </div>

      {/* Show lat/lng */}
      {formattedAddress && (
        <div className="mb-4 p-3 bg-gray-100 rounded text-sm">
          <p><b>Address:</b> {formattedAddress}</p>
          <p><b>Latitude:</b> {lat}</p>
          <p><b>Longitude:</b> {lng}</p>
        </div>
      )}

      {/* Errors */}
      {error && (
        <div className="text-red-500 text-sm mb-4">
          <b>Error:</b> {error}
        </div>
      )}

      {/* Loading */}
      {loadingR && (
        <div className="text-sm text-gray-600 mb-4">Running R analysis…</div>
      )}

      {/* R Results */}
      {results && (
        <div className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            Stations on same subway lines (Top 5 by rent)
          </h2>

          {results
            .map((s) => ({
              ...s,
              rent: s.RentDataset[0]?.avg_rent_all ?? null,
            }))
            .sort((a, b) => (b.rent ?? 0) - (a.rent ?? 0))
            .slice(0, 5)
            .map((s) => {
              const stats = s.RentDataset[0];
              return (
                <div
                  key={`${s.Stop}-${s.ForLine}`}
                  className="p-4 bg-black/90 text-white rounded"
                >
                  <p className="font-semibold">{s.Stop}</p>
                  <p className="text-xs text-gray-300">Line: {s.ForLine}</p>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <p>Overall Rent: ${stats.avg_rent_all?.toLocaleString()}</p>
                    <p>Studio: ${stats.avg_rent_studio?.toLocaleString()}</p>
                    <p>1BR: ${stats.avg_rent_1br?.toLocaleString()}</p>
                    <p>2BR: ${stats.avg_rent_2br?.toLocaleString()}</p>
                    <p>Median Income: ${stats.avg_median_income?.toLocaleString()}</p>
                    <p>Bachelors+: {(stats.avg_pct_bachelors_plus * 100).toFixed(1)}%</p>
                    <p>Foreign Born: {(stats.avg_pct_foreign_born * 100).toFixed(1)}%</p>
                    <p>Tracts: {stats.n_tracts}</p>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

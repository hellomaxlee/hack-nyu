"use client";

import { useSearchParams } from "next/navigation";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  const searchParams = useSearchParams();
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  // Only render Dashboard when both lat and lng are available
  if (lat && lng) {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    // Validate that the parsed values are valid numbers
    if (!isNaN(latitude) && !isNaN(longitude)) {
      return <Dashboard latitude={latitude} longitude={longitude} />;
    }
  }

  // Loading state while waiting for coordinates
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <p className="text-muted-foreground">Waiting for location data...</p>
    </div>
  );
}
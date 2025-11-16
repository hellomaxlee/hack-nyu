"use client";

import mapboxgl from "mapbox-gl";
import React, { Component } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { ROUTES, TRAIN_IDS } from "../data/routes";
import stationData from "../data/station_details.json";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const MANHATTAN_TILT = 29;
const center = [-73.981_19, 40.758_55];
const defaultBounds = [
  [-74.8113, 40.1797],
  [-73.3584, 41.1247],
];

class SubwayMap extends Component {
  constructor(props) {
    super(props);

    // Initialize stations with runtime properties
    const stations = {};
    for (const key of Object.keys(stationData)) {
      stations[key] = {
        ...stationData[key],
        id: key,
        stops: new Set(),
        northStops: new Set(),
        southStops: new Set(),
        passed: new Set(),
      };
    }

    // Process routes to populate station stops
    for (const trainId of Object.keys(ROUTES)) {
      for (const routing of ROUTES[trainId].routings) {
        for (const [idx, stopId] of routing.entries()) {
          if (stations[stopId]) {
            stations[stopId].stops.add(trainId);
            if (idx > 0) {
              stations[stopId].southStops.add(trainId);
            }
            if (idx < routing.length - 1) {
              stations[stopId].northStops.add(trainId);
            }
          }
        }
      }
    }

    this.state = {
      stations,
      processedRoutings: ROUTES,
      offsets: {}, // Simplified - we'll calculate basic offsets
    };

    this.mapContainer = React.createRef();
    this.map = null;
    this.mapLoaded = false;
    this.selectedTrains = TRAIN_IDS;
    this.selectedStations = [];
    this.calculatedPaths = {};
  }

  componentDidMount() {
    this.map = new mapboxgl.Map({
      container: this.mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center,
      bearing: MANHATTAN_TILT,
      minZoom: 9,
      zoom: 14,
      maxBounds: defaultBounds,
      maxPitch: 0,
    });

    this.map.on("load", () => {
      this.mapLoaded = true;
      this.calculateSimpleOffsets();
      this.renderLines();
      this.renderStops();
      this.setupClickHandlers();

      // Call onMapReady callback if provided
      if (this.props.onMapReady) {
        this.props.onMapReady();
      }
    });

    // Set up ResizeObserver to handle container resizing
    this.resizeObserver = new ResizeObserver(() => {
      if (this.map) {
        this.map.resize();
      }
    });

    if (this.mapContainer.current) {
      this.resizeObserver.observe(this.mapContainer.current);
    }
  }

  calculateSimpleOffsets() {
    // Simplified offset calculation
    const offsets = {};
    const offsetValues = [0, -2, 2, -4, 4, -6, 6];
    let offsetIndex = 0;

    for (const trainId of TRAIN_IDS) {
      offsets[trainId] = offsetValues[offsetIndex % offsetValues.length];
      offsetIndex += 1;
    }

    this.setState({ offsets });
  }

  routingGeoJson(routing) {
    const { stations } = this.state;
    const coords = [];
    let start = routing[0];

    for (let i = 1; i < routing.length; i++) {
      const end = routing[i];
      coords.push([stations[start].longitude, stations[start].latitude]);

      // Add intermediate path points if they exist
      const path = this.findPath(start, end);
      if (path && path.length > 0) {
        coords.push(...path);
      }

      start = end;
    }

    // Add final station
    coords.push([stations[start].longitude, stations[start].latitude]);
    return coords;
  }

  findPath(start, end) {
    const cacheKey = `${start}-${end}`;
    if (this.calculatedPaths[cacheKey]) {
      return this.calculatedPaths[cacheKey];
    }

    const { stations } = this.state;
    const startStation = stations[start];
    if (!startStation) {
      return [];
    }

    // Direct connection check
    if (startStation.north?.[end]) {
      this.calculatedPaths[cacheKey] = startStation.north[end];
      return startStation.north[end];
    }
    if (startStation.south?.[end]) {
      this.calculatedPaths[cacheKey] = startStation.south[end];
      return startStation.south[end];
    }

    return [];
  }

  renderLines() {
    const { processedRoutings, offsets } = this.state;

    for (const trainId of Object.keys(processedRoutings)) {
      const route = processedRoutings[trainId];
      const coordinates = route.routings.map((routing) =>
        this.routingGeoJson(routing)
      );

      const geojson = {
        type: "Feature",
        properties: {
          color: route.color,
          offset: offsets[trainId] || 0,
          opacity: this.selectedTrains.includes(trainId) ? 1 : 0.05,
        },
        geometry: {
          type: "MultiLineString",
          coordinates,
        },
      };

      const sourceId = `${trainId}-line`;
      if (this.map.getSource(sourceId)) {
        this.map.getSource(sourceId).setData(geojson);
      } else {
        this.map.addSource(sourceId, {
          type: "geojson",
          data: geojson,
        });

        this.map.addLayer({
          id: sourceId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1, 13, 5],
            "line-offset": [
              "interpolate",
              ["linear"],
              ["zoom"],
              11,
              ["get", "offset"],
              13,
              ["*", ["get", "offset"], 3],
            ],
            "line-opacity": ["get", "opacity"],
          },
        });
      }
    }
  }

  renderStops() {
    const { stations } = this.state;

    const features = Object.keys(stations).map((key) => ({
      type: "Feature",
      properties: {
        id: key,
        name: stations[key].name,
        opacity:
          this.selectedStations.length === 0 ||
          this.selectedStations.includes(key)
            ? 1
            : 0.05,
      },
      geometry: {
        type: "Point",
        coordinates: [stations[key].longitude, stations[key].latitude],
      },
    }));

    const geojson = {
      type: "FeatureCollection",
      features,
    };

    if (this.map.getSource("stations")) {
      this.map.getSource("stations").setData(geojson);
    } else {
      this.map.addSource("stations", {
        type: "geojson",
        data: geojson,
      });

      // Station dots
      this.map.addLayer({
        id: "station-dots",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2, 13, 6],
          "circle-color": "#FFFFFF",
          "circle-opacity": ["get", "opacity"],
        },
      });

      // Station labels
      this.map.addLayer({
        id: "station-labels",
        type: "symbol",
        source: "stations",
        layout: {
          "text-field": ["get", "name"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            0,
            12,
            11,
            14,
            13,
          ],
          "text-anchor": "top",
          "text-offset": [0, 0.8],
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "#000000",
          "text-halo-width": 2,
          "text-opacity": ["get", "opacity"],
        },
      });
    }
  }

  setupClickHandlers() {
    // Click handler for stations
    this.map.on("click", "station-dots", (e) => {
      if (e.features && e.features.length > 0) {
        const stationId = e.features[0].properties.id;
        this.jumpToStation(stationId);
      }
    });

    // Change cursor on hover over stations
    this.map.on("mouseenter", "station-dots", () => {
      this.map.getCanvas().style.cursor = "pointer";
    });

    this.map.on("mouseleave", "station-dots", () => {
      this.map.getCanvas().style.cursor = "";
    });

    // Click handler for lines - select only that specific line
    for (const trainId of TRAIN_IDS) {
      const layerId = `${trainId}-line`;

      this.map.on("click", layerId, (e) => {
        const clickCoordinates = [e.lngLat.lng, e.lngLat.lat];
        this.selectLines([trainId], clickCoordinates);
      });

      this.map.on("mouseenter", layerId, () => {
        this.map.getCanvas().style.cursor = "pointer";
      });

      this.map.on("mouseleave", layerId, () => {
        this.map.getCanvas().style.cursor = "";
      });
    }
  }

  // EXPORTED FUNCTION 1: Jump to a station
  jumpToStation = (stationId) => {
    if (!(this.mapLoaded && this.state.stations[stationId])) {
      console.warn(`Station ${stationId} not found or map not loaded`);
      return;
    }

    const station = this.state.stations[stationId];

    // Center on station with zoom
    this.map.easeTo({
      center: [station.longitude, station.latitude],
      zoom: 15,
      bearing: MANHATTAN_TILT,
      duration: 1000,
    });

    // Highlight the station
    this.selectedStations = [stationId];
    this.renderStops();
  };

  // EXPORTED FUNCTION 2: Select specific lines and hide others
  selectLines = (lineIds, clickCoordinates = null) => {
    if (!this.mapLoaded) {
      console.warn("Map not loaded yet");
      return;
    }

    // Validate line IDs
    const validLines = lineIds.filter((id) => TRAIN_IDS.includes(id));
    if (validLines.length === 0) {
      console.warn("No valid line IDs provided");
      return;
    }

    this.selectedTrains = validLines;

    // Update line opacities
    for (const trainId of TRAIN_IDS) {
      const layerId = `${trainId}-line`;
      if (this.map.getLayer(layerId)) {
        const opacity = validLines.includes(trainId) ? 1 : 0.05;
        this.map.setPaintProperty(layerId, "line-opacity", opacity);
      }
    }

    // Update station opacities based on selected lines
    const { stations } = this.state;
    const stationFeatures = Object.keys(stations).map((key) => ({
      type: "Feature",
      properties: {
        id: key,
        name: stations[key].name,
        opacity: validLines.some((line) => stations[key].stops.has(line))
          ? 1
          : 0.05,
      },
      geometry: {
        type: "Point",
        coordinates: [stations[key].longitude, stations[key].latitude],
      },
    }));

    const geojson = {
      type: "FeatureCollection",
      features: stationFeatures,
    };

    if (this.map.getSource("stations")) {
      this.map.getSource("stations").setData(geojson);
    }

    // Pan to click location if provided (no zoom)
    if (clickCoordinates) {
      this.map.easeTo({
        center: clickCoordinates,
        bearing: MANHATTAN_TILT,
        duration: 1000,
      });
    }
  };

  // Reset to show all lines
  showAllLines = () => {
    if (!this.mapLoaded) {
      console.warn("Map not loaded yet");
      return;
    }

    this.selectedTrains = TRAIN_IDS;
    this.selectedStations = [];

    // Update all line opacities to full
    for (const trainId of TRAIN_IDS) {
      const layerId = `${trainId}-line`;
      if (this.map.getLayer(layerId)) {
        this.map.setPaintProperty(layerId, "line-opacity", 1);
      }
    }

    // Reset all station opacities
    const { stations } = this.state;
    const stationFeatures = Object.keys(stations).map((key) => ({
      type: "Feature",
      properties: {
        id: key,
        name: stations[key].name,
        opacity: 1,
      },
      geometry: {
        type: "Point",
        coordinates: [stations[key].longitude, stations[key].latitude],
      },
    }));

    const geojson = {
      type: "FeatureCollection",
      features: stationFeatures,
    };

    if (this.map.getSource("stations")) {
      this.map.getSource("stations").setData(geojson);
    }

    // Reset camera to default view
    this.map.easeTo({
      center,
      zoom: 14,
      bearing: MANHATTAN_TILT,
      duration: 1000,
    });
  };

  componentWillUnmount() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.map) {
      this.map.remove();
    }
  }

  render() {
    return (
      <div ref={this.mapContainer} style={{ width: "100%", height: "100%" }} />
    );
  }
}


// Wrapper component to support ref forwarding
const SubwayMapWithRef = React.forwardRef(({ onMapReady, ...props }, ref) => {
  const mapInstance = React.useRef(null);

  React.useImperativeHandle(ref, () => ({
    jumpToStation: (stationId) => mapInstance.current?.jumpToStation(stationId),
    selectLines: (lineIds) => mapInstance.current?.selectLines(lineIds),
    showAllLines: () => mapInstance.current?.showAllLines(),
  }));

  // Pass through all props including onMapReady
  return <SubwayMap {...props} onMapReady={onMapReady} ref={mapInstance} />;
});

SubwayMapWithRef.displayName = "SubwayMapWithRef";

export default SubwayMapWithRef;

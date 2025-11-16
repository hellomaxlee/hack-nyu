import stationDetails from '../data/station_details.json';

/**
 * Maps station ID to station name
 * @param {string} stationId - The station ID (e.g., "R01", "D24")
 * @returns {string|null} The station name or null if not found
 */
export function getStationName(stationId) {
  const station = stationDetails[stationId];
  return station ? station.name : null;
}

/**
 * Maps multiple station IDs to their names
 * @param {string[]} stationIds - Array of station IDs
 * @returns {Object} Object mapping station IDs to names
 */
export function getStationNames(stationIds) {
  const result = {};
  stationIds.forEach(id => {
    const name = getStationName(id);
    if (name) {
      result[id] = name;
    }
  });
  return result;
}

/**
 * Creates a complete ID to name mapping for all stations
 * @returns {Object} Object mapping all station IDs to their names
 */
export function getAllStationNames() {
  const result = {};
  Object.keys(stationDetails).forEach(id => {
    result[id] = stationDetails[id].name;
  });
  return result;
}

/**
 * Gets full station details by ID
 * @param {string} stationId - The station ID
 * @returns {Object|null} The station details object or null if not found
 */
export function getStationDetails(stationId) {
  return stationDetails[stationId] || null;
}

/**
 * Finds station ID by name (case-insensitive)
 * @param {string} stationName - The station name to search for
 * @returns {string|null} The station ID or null if not found
 */
export function getStationIdByName(stationName) {
  const normalizedSearch = stationName.toLowerCase();
  const entry = Object.entries(stationDetails).find(
    ([_, station]) => station.name.toLowerCase() === normalizedSearch
  );
  return entry ? entry[0] : null;
}

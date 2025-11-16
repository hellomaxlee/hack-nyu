# Hack NYU Code
# Author: Maxwell Lee

### PLUMBER SETUP ------------------------------------------------------------

library(plumber)

# Load shared data, precomputed objects, and helper functions:
#   - stations_df, stations_sf
#   - haversine_distance(), parse_routes()
#   - stop_rent_list, etc.
source("data.R")

### PLUMBER API --------------------------------------------------------------

#* @apiTitle NYC Subway API
#* @apiDescription Closest station, stations on lines, and rent summary.
function(req, res) {
res$setHeader("Access-Control-Allow-Origin", "*")
res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
res$setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

if (req$REQUEST_METHOD == "OPTIONS") {
  res$status <- 200
  return(list())
}

plumber::forward()
}

# --- CORS filter so the Next.js frontend can call the API -------------------

#* @filter cors
function(req, res) {
  res$setHeader("Access-Control-Allow-Origin", "*")
  res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  
  if (req$REQUEST_METHOD == "OPTIONS") {
    res$status <- 200
    return(list())
  }
  
  plumber::forward()
}

# 1) /closest-station --------------------------------------------------------

#* Closest station + any others within ~0.25 miles
#* (Front-end uses this for the primary cards.)
#* @param lat:double Latitude of the input point
#* @param lng:double Longitude of the input point
#* @get /closest-station
#* @serializer json
function(lat, lng, req, res) {
  lat <- as.numeric(lat)
  lng <- as.numeric(lng)
  
  if (is.na(lat) || is.na(lng)) {
    res$status <- 400
    return(list(error = "Both 'lat' and 'lng' must be numeric query parameters."))
  }
  
  distances <- haversine_distance(
    lat1 = lat,
    lon1 = lng,
    lat2 = stations_df$Latitude,
    lon2 = stations_df$Longitude
  )
  
  df_with_dist <- stations_df %>%
    mutate(distance_miles = distances) %>%
    arrange(distance_miles)
  
  if (nrow(df_with_dist) == 0) {
    return(list(
      query = list(
        latitude  = jsonlite::unbox(lat),
        longitude = jsonlite::unbox(lng)
      ),
      stations = list()
    ))
  }
  
  # Core columns to expose
  cols_out <- intersect(
    c("stop_name", "Daytime.Routes", "Latitude", "Longitude", "distance_miles"),
    names(df_with_dist)
  )
  
  closest_row <- df_with_dist[1, , drop = FALSE]
  
  others_within <- df_with_dist %>%
    slice(-1) %>%
    filter(!is.na(distance_miles) & distance_miles <= 0.25 + 1e-6)
  
  nearby_stations <- bind_rows(closest_row, others_within) %>%
    select(all_of(cols_out))
  
  nearby_stations$distance_miles <- round(nearby_stations$distance_miles, 4)
  
  list(
    query = list(
      latitude  = jsonlite::unbox(lat),
      longitude = jsonlite::unbox(lng)
    ),
    stations = nearby_stations
  )
}
# 2) /stations-on-lines ------------------------------------------------------
#* All stations on the lines served by the closest station
#*
#* Logic:
#*  - Find the single closest station to (lat, lng)
#*  - Take that station's lines_list (e.g. c("1","2","3"))
#*  - Return every station whose lines_list shares ANY of those lines
#*
#* Returns:
#* {
#*   "closest_station": [ { stop_name, Daytime.Routes, Latitude, Longitude, distance_miles } ],
#*   "lines": ["1", "2", "3"],   # lines on closest station only
#*   "stations_on_lines": [
#*     { stop_name, Daytime.Routes, Latitude, Longitude, primary_line }
#*   ]
#* }
#*
#* @param lat:double Latitude of the input point
#* @param lng:double Longitude of the input point
#* @get /stations-on-lines
#* @serializer json
function(lat, lng, req, res) {
  lat <- as.numeric(lat)
  lng <- as.numeric(lng)
  
  if (is.na(lat) || is.na(lng)) {
    res$status <- 400
    return(list(error = "Both 'lat' and 'lng' must be numeric query parameters."))
  }
  
  # 1) Find the SINGLE closest station --------------------------------------
  distances <- haversine_distance(
    lat1 = lat,
    lon1 = lng,
    lat2 = stations_df$Latitude,
    lon2 = stations_df$Longitude
  )
  
  df_with_dist <- stations_df %>%
    mutate(distance_miles = distances) %>%
    arrange(distance_miles)
  
  if (nrow(df_with_dist) == 0) {
    return(list(
      closest_station   = list(),
      lines             = list(),
      stations_on_lines = list()
    ))
  }
  
  closest_row <- df_with_dist[1, , drop = FALSE]
  
  # 2) Lines on the closest station ONLY, using precomputed lines_list ------
  #    lines_list is a list-column of character vectors (e.g. c("1","2","3"))
  closest_lines_raw <- closest_row$lines_list[[1]]
  
  # Clean: uppercase, trim, drop empties, dedupe
  lines_closest <- closest_lines_raw %>%
    toupper() %>%
    trimws()
  lines_closest <- lines_closest[lines_closest != ""]
  lines_closest <- sort(unique(lines_closest))
  
  if (length(lines_closest) == 0) {
    # closest station has no usable line info
    closest_station_out <- closest_row %>%
      select(stop_name, Daytime.Routes, Latitude, Longitude, distance_miles)
    
    return(list(
      closest_station   = closest_station_out,
      lines             = list(),
      stations_on_lines = list()
    ))
  }
  
  # 3) All stations that serve ANY of those lines (using lines_list) --------
  mask <- vapply(
    stations_df$lines_list,
    function(v) {
      v_clean <- toupper(trimws(v))
      any(v_clean %in% lines_closest)
    },
    logical(1)
  )
  
  stations_matched <- stations_df[mask, , drop = FALSE]
  
  # primary_line = first of that station's lines that belongs to lines_closest
  stations_matched$primary_line <- vapply(
    stations_matched$lines_list,
    function(v) {
      v_clean <- toupper(trimws(v))
      pl <- v_clean[v_clean %in% lines_closest]
      if (length(pl) == 0) NA_character_ else pl[1]
    },
    character(1)
  )
  
  stations_on_lines_out <- stations_matched %>%
    select(
      stop_name,
      Daytime.Routes,
      Latitude,
      Longitude,
      primary_line
    )
  
  closest_station_out <- closest_row %>%
    select(
      stop_name,
      Daytime.Routes,
      Latitude,
      Longitude,
      distance_miles
    )
  
  list(
    closest_station   = closest_station_out,
    lines             = lines_closest,
    stations_on_lines = stations_on_lines_out
  )
}

  
# 3) /station-summary --------------------------------------------------------

#* Rent / census summary for a particular stop_name
#* (returns the nested Stop/ForLine/RentDataset structure)
#* @param stop_name The exact station name
#* @get /station-summary
#* @serializer json
function(stop_name, req, res) {
  if (missing(stop_name) || is.null(stop_name) || stop_name == "") {
    res$status <- 400
    return(list(error = "'stop_name' query parameter is required."))
  }
  
  idx <- which(vapply(stop_rent_list, function(x) x$Stop == stop_name, logical(1)))
  
  if (length(idx) == 0) {
    res$status <- 404
    return(list(error = paste0("No station summary found for stop_name = '", stop_name, "'.")))
  }
  
  stop_rent_list[idx]
}

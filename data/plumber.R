# Hack NYU Code
# Author: Maxwell Lee

# Initialize and filter CORS

library(plumber)
source("data.R")

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

# API endpoint 1: /closest-station

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

# API endpoint 2: /stations-on-lines

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
      closest_station   = list(),
      lines             = list(),
      stations_on_lines = list()
    ))
  }
  
  closest_row <- df_with_dist[1, , drop = FALSE]
  
  closest_lines_raw <- closest_row$lines_list[[1]]
  
  lines_closest <- closest_lines_raw %>%
    toupper() %>%
    trimws()
  lines_closest <- lines_closest[lines_closest != ""]
  lines_closest <- sort(unique(lines_closest))
  
  if (length(lines_closest) == 0) {
    closest_station_out <- closest_row %>%
      select(stop_name, Daytime.Routes, Latitude, Longitude, distance_miles)
    
    return(list(
      closest_station   = closest_station_out,
      lines             = list(),
      stations_on_lines = list()
    ))
  }
  
  mask <- vapply(
    stations_df$lines_list,
    function(v) {
      v_clean <- toupper(trimws(v))
      any(v_clean %in% lines_closest)
    },
    logical(1)
  )
  
  stations_matched <- stations_df[mask, , drop = FALSE]
  
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

  
# API endpoint 3: /station-summary

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

# API endpoint 4: /predict
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
      closest_station = list(),
      lines           = list(),
      stations        = list()
    ))
  }
  
  closest_row <- df_with_dist[1, , drop = FALSE]
  
  closest_lines_raw <- closest_row$lines_list[[1]]
  
  lines_closest <- closest_lines_raw %>%
    toupper() %>%
    trimws()
  lines_closest <- lines_closest[lines_closest != ""]
  lines_closest <- sort(unique(lines_closest))
  
  if (length(lines_closest) == 0) {
    closest_station_out <- closest_row %>%
      select(stop_name, Daytime.Routes, Latitude, Longitude, distance_miles)
    
    return(list(
      closest_station = closest_station_out,
      lines           = list(),
      stations        = list()
    ))
  }
  
  mask <- vapply(
    stations_df$lines_list,
    function(v) {
      v_clean <- toupper(trimws(v))
      any(v_clean %in% lines_closest)
    },
    logical(1)
  )
  
  stations_matched <- stations_df[mask, , drop = FALSE]

  station_names <- stations_matched$stop_name
  
  idx <- which(vapply(
    stop_rent_list,
    function(x) x$Stop %in% station_names,
    logical(1)
  ))
  
  stations_with_stats <- stop_rent_list[idx]
  
  closest_station_out <- closest_row %>%
    select(
      stop_name,
      Daytime.Routes,
      Latitude,
      Longitude,
      distance_miles
    )
  
  list(
    closest_station = closest_station_out,
    lines           = lines_closest,
    stations        = stations_with_stats
  )
}


# Hack NYU Code
# Author: Maxwell Lee

###

required_packages <- c(
  "pacman",
  "tidyverse",
  "ggplot2",
  "dplyr",
  "sf",
  "tigris",
  "tidycensus",
  "stringr",
  "purrr",
  "jsonlite",
  "plumber"
)

missing_packages <- required_packages[!(required_packages %in% installed.packages()[,"Package"])]

if (length(missing_packages) > 0) {
  install.packages(missing_packages)
}

library(pacman)

pacman::p_load(
  tidyverse,
  ggplot2,
  dplyr,
  sf,
  tigris,
  tidycensus,
  stringr,
  purrr,
  jsonlite,
  plumber
)

census_api_key("f93cd840b4ef93c2e0b640f5cac639fe7430a61a", install = TRUE, overwrite = TRUE)
options(tigris_use_cache = TRUE)
df <- read.csv("stations.csv") 

###

# Helper function to calculate distance between two lat/lon points
haversine_distance <- function(lat1, lon1, lat2, lon2) {
  R <- 3959  # Earth's radius in miles
  lat1_rad <- lat1 * pi / 180
  lat2_rad <- lat2 * pi / 180
  delta_lat <- (lat2 - lat1) * pi / 180
  delta_lon <- (lon2 - lon1) * pi / 180
  
  a <- sin(delta_lat/2)^2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon/2)^2
  c <- 2 * asin(sqrt(a))
  return(R * c)
}

# Main function: analyze subway accessibility and rent data for a given location
run_model <- function(input_latitude, input_longitude) {
  
  df$distance <- haversine_distance(
    input_latitude,
    input_longitude,
    df$Latitude,
    df$Longitude
  )
  
  # Split lines for each station into a list
  df$lines_list <- str_split(df$Daytime.Routes, " ")
  
  # Find the row that corresponds to the minimum distance
  closest_station <- df %>% filter(distance == min(distance))
  
  # Find the lines that it encompasses
  lines <- str_split(closest_station$Daytime.Routes, " ")[[1]]
  
  # Find all the stations that are on those lines
  relevant_lines <- df %>%
    filter(sapply(lines_list, function(x) any(x %in% lines)))
  
  # Find the primary line in common
  relevant_lines <- relevant_lines %>%
    rowwise() %>%
    mutate(
      primary_line = {
        overlap <- intersect(lines_list, lines)
        if (length(overlap) == 0) NA_character_ else overlap[1]
      }
    ) %>%
    ungroup()
  
  ###
  
  # Convert relevant stations to sf points (WGS84)
  stations_sf <- relevant_lines %>%
    st_as_sf(
      coords = c("Longitude", "Latitude"),
      crs = 4326,
      remove = FALSE
    ) %>%
    rename(stop_name = Stop.Name)
  
  # Pull ACS tracts for NYC's 5 boroughs
  tracts_nyc <- get_acs(
    geography = "tract",
    variables = "B01001_001",  # total population (dummy var)
    state = "NY",
    county = c("New York", "Kings", "Queens", "Bronx", "Richmond"),
    year = 2022,
    geometry = TRUE
  ) %>%
    select(GEOID, NAME, total_pop = estimate, geometry)
  
  # Project to feet for distance-accurate buffering (EPSG:2263: NY Long Island)
  half_mile_ft <- 0.25 * 5280
  
  stations_2263 <- st_transform(stations_sf, 2263)
  tracts_2263   <- st_transform(tracts_nyc, 2263)
  
  # 0.25-mile buffers around each relevant station
  buffers_2263 <- stations_2263 %>%
    st_buffer(dist = half_mile_ft)
  
  # Tracts that intersect each station's buffer
  tracts_by_stop_2263 <- st_intersection(
    buffers_2263 %>% select(stop_name),
    tracts_2263 %>% select(GEOID, geometry)
  )
  
  # Table mapping tracts
  tract_stop_map <- tracts_by_stop_2263 %>%
    st_drop_geometry() %>%
    distinct(GEOID, stop_name)
  
  # Back to WGS84 for plotting
  tracts_nyc_4326      <- st_transform(tracts_nyc, 4326)
  buffers_4326         <- st_transform(buffers_2263, 4326)
  tracts_by_stop_4326  <- st_transform(tracts_by_stop_2263, 4326)
  
  # Compute a zoom window based on buffer bounding box (adds padding)
  bbox <- st_bbox(buffers_4326)
  pad  <- 0.01   # degrees of lat/long padding ≈ small zoom
  
  xlim <- c(bbox$xmin - pad, bbox$xmax + pad)
  ylim <- c(bbox$ymin - pad, bbox$ymax + pad)
  
  line_colors <- c(
    "1" = "#EE352E", "2" = "#EE352E", "3" = "#EE352E",  # Red
    "4" = "#00933C", "5" = "#00933C", "6" = "#00933C",  # Green
    "7" = "#B933AD",                                   # Purple
    "A" = "#0039A6", "C" = "#0039A6", "E" = "#0039A6",  # Blue
    "B" = "#FF6319", "D" = "#FF6319", "F" = "#FF6319", "M" = "#FF6319", # Orange
    "N" = "#FCCC0A", "Q" = "#FCCC0A", "R" = "#FCCC0A", "W" = "#FCCC0A", # Yellow
    "G" = "#6CBE45",                                   # Light Green
    "J" = "#996633", "Z" = "#996633",                  # Brown
    "L" = "#A7A9AC",                                   # Gray
    "S" = "#808183"                                    # Darker Gray (shuttles)
  )
  
  # Create dataframe of line -> MTA color
  line_color_df <- tibble(
    line = names(line_colors),
    color = unname(line_colors)
  )
  
  # Assign different shapes within each color group
  unique_shapes <- c(21, 22, 23, 24, 25, 1, 2, 5)  # shapes that show well
  
  line_shape_df <- line_color_df %>%
    group_by(color) %>%
    mutate(shape = unique_shapes[1:n()]) %>%
    ungroup()
  
  # Convert to named vector for scale_shape_manual
  line_shapes <- line_shape_df$shape
  names(line_shapes) <- line_shape_df$line
  
  # (Optional) Plot – side effect only, not returned
  p <- ggplot() +
    geom_sf(data = tracts_nyc_4326,
            fill = "white", color = "black", linewidth = 0.1) +
    geom_sf(data = tracts_by_stop_4326,
            aes(fill = stop_name),
            color = NA, alpha = 0.7) +
    geom_sf(data = buffers_4326,
            aes(fill = primary_line, color = primary_line),
            alpha = 0.30, linewidth = 0.4) +
    geom_sf(data = stations_sf,
            aes(color = primary_line, shape = primary_line),
            size = 1.2) +
    scale_color_manual(values = line_colors) +
    scale_fill_manual(values = line_colors, guide = "none") +
    scale_shape_manual(values = line_shapes) +
    coord_sf(xlim = xlim, ylim = ylim) +
    theme_minimal() +
    theme(
      legend.position = "bottom",
      legend.box = "horizontal"
    ) +
    labs(
      title    = "Walking Distance of Relevant NYC Subway Stations",
      x = NULL,
      y = NULL,
      shape = "Subway Line",
      color = "Subway Line"
    )
  
  ggsave(
    filename = "Chart1.png",
    plot     = p,
    width    = 10,
    height   = 8,
    dpi      = 300
  )
  
  ### Rent / income / education / foreign-born
  
  rent_income_vars <- c(
    rent_all      = "B25058_001",  # median gross rent (overall)
    rent_studio   = "B25031_002",  # studio
    rent_1br      = "B25031_003",  # 1 bedroom
    rent_2br      = "B25031_004",  # 2 bedroom
    median_income = "B19013_001"   # median household income
  )
  
  rent_income_acs <- get_acs(
    geography = "tract",
    variables = rent_income_vars,
    state     = "NY",
    county    = c("New York", "Kings", "Queens", "Bronx", "Richmond"),
    year      = 2023,
    geometry  = FALSE
  ) %>%
    select(GEOID, variable, estimate) %>%
    pivot_wider(names_from = variable, values_from = estimate)
  
  educ_raw <- get_acs(
    geography = "tract",
    table     = "B15003",
    state     = "NY",
    county    = c("New York", "Kings", "Queens", "Bronx", "Richmond"),
    year      = 2023,
    geometry  = FALSE
  )
  
  education <- educ_raw %>%
    select(GEOID, variable, estimate) %>%
    pivot_wider(names_from = variable, values_from = estimate) %>%
    transmute(
      GEOID,
      pct_bachelors_plus = (
        B15003_022 + B15003_023 + B15003_024 + B15003_025
      ) / B15003_001
    )
  
  fb_raw <- get_acs(
    geography = "tract",
    table     = "B05002",
    state     = "NY",
    county    = c("New York", "Kings", "Queens", "Bronx", "Richmond"),
    year      = 2023,
    geometry  = FALSE
  )
  
  foreign_born <- fb_raw %>%
    select(GEOID, variable, estimate) %>%
    pivot_wider(names_from = variable, values_from = estimate) %>%
    transmute(
      GEOID,
      pct_foreign_born = B05002_013 / B05002_001
    )
  
  rent_qol_acs <- rent_income_acs %>%
    left_join(education,    by = "GEOID") %>%
    left_join(foreign_born, by = "GEOID")
  
  tracts_with_rent <- tract_stop_map %>%
    left_join(rent_qol_acs, by = "GEOID")
  
  rent_by_station <- tracts_with_rent %>%
    group_by(stop_name) %>%
    summarize(
      avg_rent_all           = mean(rent_all,      na.rm = TRUE),
      avg_rent_studio        = mean(rent_studio,   na.rm = TRUE),
      avg_rent_1br           = mean(rent_1br,      na.rm = TRUE),
      avg_rent_2br           = mean(rent_2br,      na.rm = TRUE),
      avg_median_income      = mean(median_income, na.rm = TRUE),
      avg_pct_bachelors_plus = mean(pct_bachelors_plus, na.rm = TRUE),
      avg_pct_foreign_born   = mean(pct_foreign_born,   na.rm = TRUE),
      n_tracts               = n()
    ) %>%
    arrange(desc(avg_rent_all))
  
  ### Station info and nested list
  
  stations_info <- stations_sf %>%
    st_drop_geometry() %>%
    select(stop_name, primary_line, Longitude, Latitude)
  
  station_summary <- rent_by_station %>%
    left_join(stations_info, by = "stop_name")
  
  stop_rent_list <- station_summary %>%
    pmap(function(stop_name,
                  avg_rent_all,
                  avg_rent_studio,
                  avg_rent_1br,
                  avg_rent_2br,
                  avg_median_income,
                  avg_pct_bachelors_plus,
                  avg_pct_foreign_born,
                  n_tracts,
                  primary_line,
                  Longitude,
                  Latitude) {
      list(
        Stop    = stop_name,
        ForLine = primary_line,
        Long    = Longitude,
        Lat     = Latitude,
        RentDataset = list(list(
          avg_rent_all           = avg_rent_all,
          avg_rent_studio        = avg_rent_studio,
          avg_rent_1br           = avg_rent_1br,
          avg_rent_2br           = avg_rent_2br,
          avg_median_income      = avg_median_income,
          avg_pct_bachelors_plus = avg_pct_bachelors_plus,
          avg_pct_foreign_born   = avg_pct_foreign_born,
          n_tracts               = n_tracts
        ))
      )
    })
  
  # Final return: a list that Plumber will JSON-ify
  return(stop_rent_list)
}
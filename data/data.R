# Hack NYU Code
# Author: Maxwell Lee

### PACKAGES & SETUP ---------------------------------------------------------

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
  "jsonlite"
)

missing_packages <- required_packages[!(required_packages %in% installed.packages()[, "Package"])]
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
  jsonlite
)

census_api_key("f93cd840b4ef93c2e0b640f5cac639fe7430a61a", install = TRUE, overwrite = TRUE)
options(tigris_use_cache = TRUE)

### STATIONS MASTER TABLE ----------------------------------------------------

raw_stations <- read.csv("stations.csv")

# Normalize column names (adjust if needed to match your CSV)
stations_df <- raw_stations %>%
  rename(
    stop_name      = Stop.Name,
    Daytime.Routes = Daytime.Routes,
    Latitude       = Latitude,
    Longitude      = Longitude
  )

# Precompute list of routes per station
stations_df$lines_list <- str_split(stations_df$Daytime.Routes, " ")

# sf object for spatial work
stations_sf <- stations_df %>%
  st_as_sf(
    coords  = c("Longitude", "Latitude"),
    crs     = 4326,
    remove  = FALSE
  )

### HELPER FUNCTIONS ---------------------------------------------------------

# Haversine distance in miles
haversine_distance <- function(lat1, lon1, lat2, lon2) {
  R <- 3959  # Earth's radius in miles
  
  lat1_rad <- lat1 * pi / 180
  lat2_rad <- lat2 * pi / 180
  delta_lat <- (lat2 - lat1) * pi / 180
  delta_lon <- (lon2 - lon1) * pi / 180
  
  a <- sin(delta_lat / 2)^2 +
    cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2)^2
  c <- 2 * asin(sqrt(a))
  
  R * c
}

# Robust tokenization for routes (handles spaces, commas, dashes, etc.)
parse_routes <- function(x) {
  if (is.null(x) || is.na(x)) return(character(0))
  
  tokens <- unlist(strsplit(as.character(x), "[,\\s/|-]+"))
  tokens <- toupper(trimws(tokens))
  tokens <- tokens[nzchar(tokens)]
  
  unique(tokens)
}

### TRACTS + BUFFERS (SPATIAL SCOPE) ----------------------------------------

# Basic tract geometry for NYC 5 boroughs (used for buffers & plotting)
tracts_nyc <- get_acs(
  geography = "tract",
  variables = "B01001_001",  # total population (dummy variable)
  state     = "NY",
  county    = c("New York", "Kings", "Queens", "Bronx", "Richmond"),
  year      = 2022,
  geometry  = TRUE
) %>%
  select(GEOID, NAME, total_pop = estimate, geometry)

# Project to feet (EPSG:2263) for distance-accurate buffers
quarter_mile_ft <- 0.25 * 5280

stations_2263 <- st_transform(stations_sf, 2263)
tracts_2263   <- st_transform(tracts_nyc, 2263)

# 0.25-mile buffers around every station in the system
buffers_2263 <- stations_2263 %>%
  st_buffer(dist = quarter_mile_ft)

# Tracts that intersect each station's buffer
tracts_by_stop_2263 <- st_intersection(
  buffers_2263 %>% select(stop_name),
  tracts_2263 %>% select(GEOID, geometry)
)

# Mapping from tract -> station(s)
tract_stop_map <- tracts_by_stop_2263 %>%
  st_drop_geometry() %>%
  distinct(GEOID, stop_name)

### RENT / INCOME / EDUCATION / FOREIGN-BORN (ACS 2023) ---------------------

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

# Education: % bachelor's+ (B15003)
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
      B15003_022 +
        B15003_023 +
        B15003_024 +
        B15003_025
    ) / B15003_001
  )

# Foreign-born share (B05002)
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

# Merge all ACS covariates together
rent_qol_acs <- rent_income_acs %>%
  left_join(education,    by = "GEOID") %>%
  left_join(foreign_born, by = "GEOID")

# Attach ACS-covariates to the tract ↔ station map
tracts_with_rent <- tract_stop_map %>%
  left_join(rent_qol_acs, by = "GEOID")

# Aggregate to station level
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
    n_tracts               = n(),
    .groups                = "drop"
  ) %>%
  arrange(desc(avg_rent_all))

# Station info + line list
stations_info <- stations_sf %>%
  st_drop_geometry() %>%
  select(stop_name, Daytime.Routes, Longitude, Latitude) %>%
  group_by(stop_name) %>%
  summarize(
    all_lines = list(unique(unlist(str_split(Daytime.Routes, " ")))),
    Longitude = first(Longitude),
    Latitude  = first(Latitude),
    .groups   = "drop"
  )

# Combined station summary (what the front end uses)
station_summary <- rent_by_station %>%
  left_join(stations_info, by = "stop_name") %>%
  select(
    stop_name,
    avg_rent_all,
    avg_rent_studio,
    avg_rent_1br,
    avg_rent_2br,
    avg_median_income,
    avg_pct_bachelors_plus,
    avg_pct_foreign_born,
    n_tracts,
    all_lines,
    Longitude,
    Latitude
  )

# Nested list structure for JSON (used by /station-summary)
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
                all_lines,
                Longitude,
                Latitude) {
    list(
      Stop    = stop_name,
      ForLine = all_lines,
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

### OPTIONAL PLOTTING UTILITIES + run_model() -------------------------------

# MTA line colors for plotting
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

line_color_df <- tibble(
  line  = names(line_colors),
  color = unname(line_colors)
)

# Shapes within each color group for plotting points
unique_shapes <- c(21, 22, 23, 24, 25, 1, 2, 5)

line_shape_df <- line_color_df %>%
  group_by(color) %>%
  mutate(shape = unique_shapes[1:n()]) %>%
  ungroup()

line_shapes <- line_shape_df$shape
names(line_shapes) <- line_shape_df$line

# Main function: analyze accessibility + produce map for a given location
# (Reuses globally precomputed tracts, buffers, etc. No repeated ACS pulls.)
run_model <- function(input_latitude, input_longitude) {
  
  # Distance from input point to all stations
  distances <- haversine_distance(
    lat1 = input_latitude,
    lon1 = input_longitude,
    lat2 = stations_df$Latitude,
    lon2 = stations_df$Longitude
  )
  
  df_with_dist <- stations_df %>%
    mutate(distance = distances)
  
  closest_station <- df_with_dist %>%
    filter(distance == min(distance, na.rm = TRUE)) %>%
    slice(1)
  
  # Lines served by closest station
  lines <- parse_routes(closest_station$Daytime.Routes[1])
  
  # All stations serving any of those lines
  relevant_lines_df <- df_with_dist %>%
    filter(sapply(lines_list, function(x) any(x %in% lines))) %>%
    rowwise() %>%
    mutate(
      primary_line = {
        overlap <- intersect(parse_routes(Daytime.Routes), lines)
        if (length(overlap) == 0) NA_character_ else overlap[1]
      }
    ) %>%
    ungroup()
  
  # Local sf object for relevant stations only
  stations_sf_local <- relevant_lines_df %>%
    st_as_sf(
      coords  = c("Longitude", "Latitude"),
      crs     = 4326,
      remove  = FALSE
    )
  
  # Create local buffers & intersect with tract geometry
  stations_2263_local <- st_transform(stations_sf_local, 2263)
  buffers_2263_local  <- st_buffer(stations_2263_local, dist = quarter_mile_ft)
  buffers_4326        <- st_transform(buffers_2263_local, 4326)
  
  tracts_nyc_4326 <- st_transform(tracts_nyc, 4326)
  
  tracts_by_stop_2263_local <- st_intersection(
    buffers_2263_local %>% select(stop_name),
    tracts_2263 %>% select(GEOID, geometry)
  )
  
  tracts_by_stop_4326 <- st_transform(tracts_by_stop_2263_local, 4326)
  
  # Zoom window for plotting
  bbox <- st_bbox(buffers_4326)
  pad  <- 0.01
  xlim <- c(bbox$xmin - pad, bbox$xmax + pad)
  ylim <- c(bbox$ymin - pad, bbox$ymax + pad)
  
  # Plot
  p <- ggplot() +
    geom_sf(
      data   = tracts_nyc_4326,
      fill   = "white",
      color  = "black",
      linewidth = 0.1
    ) +
    geom_sf(
      data = tracts_by_stop_4326,
      aes(fill = stop_name),
      color = NA,
      alpha = 0.7
    ) +
    geom_sf(
      data = buffers_4326,
      aes(fill = primary_line, color = primary_line),
      alpha     = 0.30,
      linewidth = 0.4
    ) +
    geom_sf(
      data = stations_sf_local,
      aes(color = primary_line, shape = primary_line),
      size = 1.2
    ) +
    scale_color_manual(values = line_colors) +
    scale_fill_manual(values = line_colors, guide = "none") +
    scale_shape_manual(values = line_shapes) +
    coord_sf(xlim = xlim, ylim = ylim) +
    theme_minimal() +
    theme(
      legend.position = "bottom",
      legend.box      = "horizontal"
    ) +
    labs(
      title = "Walking Distance of Relevant NYC Subway Stations",
      x     = NULL,
      y     = NULL,
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
  
  # Return the precomputed stop_rent_list so it's consistent with the API
  return(stop_rent_list)
}

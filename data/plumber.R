# Plumber for API call

library(plumber)

source("data.R")

function(lat, lng) {
  lat <- as.numeric(lat)
  lng <- as.numeric(lng)

  if (is.na(lat) || is.na(lng)) {
    return(list(error = "lat and lng must be numeric"))
  }

  result <- run_model(lat, lng)

  result
}

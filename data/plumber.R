# Plumber for API call

install.packages("plumber")
library(plumber)

source("data.R")

#* @filter cors
cors <- function(req, res) {
  res$setHeader("Access-Control-Allow-Origin", "*")
  res$setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  
  if (req$REQUEST_METHOD == "OPTIONS") {
    res$status <- 200
    return(list())
  } else {
    plumber::forward()
  }
}

#* Predict subway accessibility and rent data for a location
#* @param lat Latitude of the location
#* @param lng Longitude of the location
#* @get /predict
function(lat, lng) {
  lat <- as.numeric(lat)
  lng <- as.numeric(lng)
  
  if (is.na(lat) || is.na(lng)) {
    return(list(error = "lat and lng must be numeric"))
  }
  
  result <- run_model(lat, lng)
  
  return(result)
}

# Plumber for API call

library(plumber)

source("data.R")

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

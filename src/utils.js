const METERS_PER_DEGREE_LAT = 111320;

function metersToLat(meters) {
  return meters / METERS_PER_DEGREE_LAT;
}

function metersToLon(meters, latitude) {
  return meters / (METERS_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180));
}

function distanceMeters(a, b) {
  const meanLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const deltaLat = (b.lat - a.lat) * METERS_PER_DEGREE_LAT;
  const deltaLon = (b.lon - a.lon) * METERS_PER_DEGREE_LAT * Math.cos(meanLat);
  return Math.sqrt(deltaLat * deltaLat + deltaLon * deltaLon);
}

function midpoint(a, b) {
  return {
    lat: (a.lat + b.lat) / 2,
    lon: (a.lon + b.lon) / 2,
  };
}

function formatNumber(value, digits = 3) {
  return Number.parseFloat(value).toFixed(digits);
}

function createId(prefix, number, width = 4) {
  return `${prefix}-${String(number).padStart(width, '0')}`;
}

module.exports = {
  metersToLat,
  metersToLon,
  distanceMeters,
  midpoint,
  formatNumber,
  createId,
};

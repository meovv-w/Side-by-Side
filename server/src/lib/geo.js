const EARTH_RADIUS_M = 6371000;

function toRad(value) {
  return value * Math.PI / 180;
}

function distanceMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(Number(a.lat))) * Math.cos(toRad(Number(b.lat))) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function routeMatchRate(candidate, trip) {
  const start = distanceMeters(candidate.start, trip.start);
  const end = distanceMeters(candidate.end, trip.end);
  const startScore = Math.max(0, 1 - start / 200000);
  const endScore = Math.max(0, 1 - end / 200000);
  const endpointScore = (startScore + endScore) / 2;
  const candidatePath = routePoints(candidate);
  const tripPath = routePoints(trip);
  if (candidatePath.length < 2 || tripPath.length < 2) return Math.round(endpointScore * 100);
  const candidateCoverage = pathCoverage(samplePath(candidatePath), tripPath);
  const tripCoverage = pathCoverage(samplePath(tripPath), candidatePath);
  const overlapScore = (candidateCoverage + tripCoverage) / 2;
  return Math.round((overlapScore * 0.75 + endpointScore * 0.25) * 100);
}

function routePoints(value) {
  const route = Array.isArray(value && value.route)
    ? value.route.filter(point => Number.isFinite(Number(point.lng)) && Number.isFinite(Number(point.lat)))
    : [];
  if (route.length >= 2) return route;
  return [value && value.start, value && value.end].filter(Boolean);
}

function samplePath(route) {
  const sampled = [route[0]];
  for (let index = 0; index < route.length - 1 && sampled.length < 120; index += 1) {
    const first = route[index];
    const second = route[index + 1];
    const steps = Math.max(1, Math.min(20, Math.ceil(distanceMeters(first, second) / 10000)));
    for (let step = 1; step <= steps && sampled.length < 120; step += 1) sampled.push({
      lng: Number(first.lng) + (Number(second.lng) - Number(first.lng)) * step / steps,
      lat: Number(first.lat) + (Number(second.lat) - Number(first.lat)) * step / steps
    });
  }
  return sampled;
}

function pathCoverage(points, route) {
  if (!points.length) return 0;
  return points.reduce((sum, point) => {
    const distance = distanceFromRoute(point, route);
    return sum + Math.max(0, 1 - distance / 30000);
  }, 0) / points.length;
}

function pointToSegmentDistance(point, a, b) {
  const x = Number(point.lng); const y = Number(point.lat);
  const x1 = Number(a.lng); const y1 = Number(a.lat);
  const x2 = Number(b.lng); const y2 = Number(b.lat);
  const dx = x2 - x1; const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSq)) : 0;
  return distanceMeters(point, { lng: x1 + t * dx, lat: y1 + t * dy });
}

function distanceFromRoute(point, route = []) {
  if (!point || route.length < 2) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < route.length - 1; i += 1) best = Math.min(best, pointToSegmentDistance(point, route[i], route[i + 1]));
  return best;
}

module.exports = { distanceMeters, routeMatchRate, distanceFromRoute };

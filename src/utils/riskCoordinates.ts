/** Convert GCJ-02 coordinates for the WGS84-based map. */
export function gcj02ToWgs84(longitude: number, latitude: number): [number, number] {
  if (longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271) return [longitude, latitude];
  const x = longitude - 105, y = latitude - 35;
  let lat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  lat += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  lat += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  lat += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  let lng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  lng += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  lng += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  lng += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  const radians = latitude / 180 * Math.PI;
  const magic = 1 - 0.006693421622965943 * Math.sin(radians) ** 2;
  const root = Math.sqrt(magic);
  const dLat = lat * 180 / ((6378245 * (1 - 0.006693421622965943)) / (magic * root) * Math.PI);
  const dLng = lng * 180 / (6378245 / root * Math.cos(radians) * Math.PI);
  return [longitude - dLng, latitude - dLat];
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface Fence {
  id: string;
  lat: number;
  lng: number;
  geofenceM: number;
}

/** Returns the nearest location whose geofence contains the point, or null. */
export function insideFence<T extends Fence>(lat: number, lng: number, fences: T[]): T | null {
  let best: { f: T; d: number } | null = null;
  for (const f of fences) {
    const d = distanceMeters(lat, lng, f.lat, f.lng);
    if (d <= f.geofenceM && (!best || d < best.d)) best = { f, d };
  }
  return best?.f ?? null;
}

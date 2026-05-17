import type { Place } from "./domain";

export type UserLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  source: "browser" | "fallback" | "search";
};

export type GeoBounds = {
  south: number;
  north: number;
  west: number;
  east: number;
};

export type PlaceWithDistance = Place & {
  distanceMeters: number;
};

export const DEFAULT_USER_LOCATION: UserLocation = {
  latitude: 37.5665,
  longitude: 126.978,
  source: "fallback",
};

export const NEARBY_RADIUS_METERS = 2_000;

export function getNearbyPlaces(
  places: Place[],
  location: Pick<UserLocation, "latitude" | "longitude">,
  radiusMeters = NEARBY_RADIUS_METERS
): PlaceWithDistance[] {
  return places
    .map((place) => ({
      ...place,
      distanceMeters: getDistanceMeters(
        location.latitude,
        location.longitude,
        place.latitude,
        place.longitude
      ),
    }))
    .filter((place) => place.distanceMeters <= radiusMeters)
    .sort((first, second) => first.distanceMeters - second.distanceMeters);
}

export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const earthRadius = 6_371_000;
  const latDelta = toRadians(lat2 - lat1);
  const lonDelta = toRadians(lon2 - lon1);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lonDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadius * c);
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

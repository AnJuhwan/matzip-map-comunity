import type { Place } from "./domain";

export type MapView = {
  latitude: number;
  longitude: number;
  zoom: number;
};

export const DEFAULT_MAP_VIEW: MapView = {
  latitude: 37.5665,
  longitude: 126.978,
  zoom: 11,
};

const PLACE_MAP_ZOOM = 13;

export function getInitialMapView(places: Place[], selectedPlaceId?: string): MapView {
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? places[0];

  if (!selectedPlace) {
    return DEFAULT_MAP_VIEW;
  }

  return {
    latitude: selectedPlace.latitude,
    longitude: selectedPlace.longitude,
    zoom: PLACE_MAP_ZOOM,
  };
}

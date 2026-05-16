import type { Place } from "@/entities/community";

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
const FALLBACK_LABEL_LIMIT = 12;
const FALLBACK_MARKER_MARGIN = 12;

export type FallbackMapMarker = {
  id: string;
  left: number;
  top: number;
  isSelected: boolean;
  showLabel: boolean;
};

type NaverMapAuthFailureTarget = {
  navermap_authFailure?: () => void;
};

type NaverMapMarkerLike = {
  setMap(map: unknown | null): void;
};

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

export function getFallbackMapMarkers(
  places: Place[],
  selectedPlaceId?: string
): FallbackMapMarker[] {
  if (!places.length) {
    return [];
  }

  const bounds = getFallbackMapBounds(places);
  const resolvedSelectedPlaceId =
    places.find((place) => place.id === selectedPlaceId)?.id ?? places[0]?.id;
  const shouldShowEveryLabel = places.length <= FALLBACK_LABEL_LIMIT;

  return places.map((place) => {
    const left = toBoundedPercent(place.longitude, bounds.minLng, bounds.maxLng);
    const top = 100 - toBoundedPercent(place.latitude, bounds.minLat, bounds.maxLat);
    const isSelected = place.id === resolvedSelectedPlaceId;

    return {
      id: place.id,
      left,
      top,
      isSelected,
      showLabel: shouldShowEveryLabel || isSelected,
    };
  });
}

export function installNaverMapAuthFailureHandler(
  target: NaverMapAuthFailureTarget,
  onFailure: () => void
) {
  const previousHandler = target.navermap_authFailure;
  const nextHandler = () => {
    previousHandler?.();
    onFailure();
  };

  target.navermap_authFailure = nextHandler;

  return () => {
    if (target.navermap_authFailure !== nextHandler) {
      return;
    }

    if (previousHandler) {
      target.navermap_authFailure = previousHandler;
    } else {
      delete target.navermap_authFailure;
    }
  };
}

export function clearNaverMapMarkers(markers: NaverMapMarkerLike[]) {
  markers.forEach((marker) => {
    try {
      marker.setMap(null);
    } catch {
      // The Naver SDK can throw during marker cleanup after auth failures.
    }
  });
}

function getFallbackMapBounds(places: Place[]) {
  const latitudes = places.map((place) => place.latitude);
  const longitudes = places.map((place) => place.longitude);

  return {
    minLat: Math.min(...latitudes),
    maxLat: Math.max(...latitudes),
    minLng: Math.min(...longitudes),
    maxLng: Math.max(...longitudes),
  };
}

function toBoundedPercent(value: number, min: number, max: number) {
  if (min === max) {
    return 50;
  }

  const usableRange = 100 - FALLBACK_MARKER_MARGIN * 2;
  return FALLBACK_MARKER_MARGIN + ((value - min) / (max - min)) * usableRange;
}

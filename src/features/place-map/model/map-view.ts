import type { GeoBounds, Place, UserLocation } from "@/entities/community";

export type MapView = {
  latitude: number;
  longitude: number;
  zoom: number;
};

export const DEFAULT_MAP_VIEW: MapView = {
  latitude: 37.5665,
  longitude: 126.978,
  zoom: 16,
};

export const FOCUSED_MAP_ZOOM = 16;
const PLACE_MAP_ZOOM = FOCUSED_MAP_ZOOM;
const USER_LOCATION_MAP_ZOOM = FOCUSED_MAP_ZOOM;
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

type NaverLatLngLike = {
  lat(): number;
  lng(): number;
};

type NaverMapBoundsLike = {
  getSW(): NaverLatLngLike;
  getNE(): NaverLatLngLike;
};

export function getInitialMapView(
  places: Place[],
  selectedPlaceId?: string,
  userLocation?: Pick<UserLocation, "latitude" | "longitude">
): MapView {
  const selectedPlace = selectedPlaceId
    ? places.find((place) => place.id === selectedPlaceId)
    : undefined;

  if (selectedPlace) {
    return {
      latitude: selectedPlace.latitude,
      longitude: selectedPlace.longitude,
      zoom: PLACE_MAP_ZOOM,
    };
  }

  if (userLocation) {
    return {
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      zoom: USER_LOCATION_MAP_ZOOM,
    };
  }

  const firstPlace = places[0];

  if (!firstPlace) {
    return DEFAULT_MAP_VIEW;
  }

  return {
    latitude: firstPlace.latitude,
    longitude: firstPlace.longitude,
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

export function readNaverMapBounds(bounds: NaverMapBoundsLike): GeoBounds {
  const southWest = bounds.getSW();
  const northEast = bounds.getNE();

  return {
    south: southWest.lat(),
    north: northEast.lat(),
    west: southWest.lng(),
    east: northEast.lng(),
  };
}

export function getCenteredGeoBounds(
  center: Pick<MapView, "latitude" | "longitude">,
  options: { latitudeDelta?: number; longitudeDelta?: number } = {}
): GeoBounds {
  const latitudeDelta = options.latitudeDelta ?? 0.02;
  const longitudeDelta = options.longitudeDelta ?? 0.02;

  return {
    south: center.latitude - latitudeDelta / 2,
    north: center.latitude + latitudeDelta / 2,
    west: center.longitude - longitudeDelta / 2,
    east: center.longitude + longitudeDelta / 2,
  };
}

export function getPlaceMarkerSummary(place: Pick<Place, "reviewCount" | "averageRevisitScore">) {
  const reviewCount = place.reviewCount ?? 0;

  return {
    reviewLabel: `리뷰 ${reviewCount}`,
    ratingLabel:
      reviewCount > 0 && Number.isFinite(place.averageRevisitScore)
        ? `★ ${((place.averageRevisitScore ?? 0) * 5).toFixed(1)}`
        : "평점 준비중",
  };
}

export function shouldApplyProgrammaticMapFocus(nextFocusKey: number, lastAppliedFocusKey: number) {
  return nextFocusKey > 0 && nextFocusKey > lastAppliedFocusKey;
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

"use client";

import { LocateFixed, MapPin, Navigation } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoBounds, Place, UserLocation } from "@/entities/community";
import {
  clearNaverMapMarkers,
  FOCUSED_MAP_ZOOM,
  getCenteredGeoBounds,
  getFallbackMapMarkers,
  getInitialMapView,
  getPlaceMarkerSummary,
  installNaverMapAuthFailureHandler,
  readNaverMapBounds,
  shouldApplyProgrammaticMapFocus,
} from "../model/map-view";

type NaverLatLng = {
  lat(): number;
  lng(): number;
};
type NaverLatLngBounds = {
  getSW(): NaverLatLng;
  getNE(): NaverLatLng;
};
type NaverPoint = object;
type NaverSize = object;
type NaverMap = {
  setCenter(position: NaverLatLng): void;
  setZoom(zoom: number): void;
  getBounds(): NaverLatLngBounds;
};
type NaverMapEventListener = object;
type NaverMarker = {
  setMap(map: NaverMap | null): void;
};
type NaverReverseGeocodeResponse = {
  v2?: {
    status?: {
      code?: number;
      name?: string;
    };
    results?: Array<{
      region?: {
        area1?: { name?: string };
        area2?: { name?: string };
        area3?: { name?: string };
        area4?: { name?: string };
      };
    }>;
  };
};
type NaverMarkerOptions = {
  position: NaverLatLng;
  map: NaverMap;
  title: string;
  icon?: {
    content: string;
    size?: NaverSize;
    anchor?: NaverPoint;
  };
};
type NaverMaps = {
  LatLng: new (latitude: number, longitude: number) => NaverLatLng;
  Point: new (x: number, y: number) => NaverPoint;
  Size: new (width: number, height: number) => NaverSize;
  Map: new (element: HTMLElement, options: { center: NaverLatLng; zoom: number }) => NaverMap;
  Marker: new (options: NaverMarkerOptions) => NaverMarker;
  Event: {
    addListener(target: object, eventName: string, listener: () => void): NaverMapEventListener;
    removeListener(listener: NaverMapEventListener | NaverMapEventListener[]): void;
  };
  Service?: {
    CoordinatesType?: {
      LATLNG?: string;
    };
    OrderType?: {
      ADDR?: string;
      ROAD_ADDR?: string;
    };
    Status?: {
      OK?: number;
    };
    reverseGeocode?: (
      options: {
        coords: NaverLatLng;
        sourcecrs?: string;
        targetcrs?: string;
        orders?: string;
      },
      callback: (status: number, response?: NaverReverseGeocodeResponse) => void
    ) => void;
  };
};

declare global {
  interface Window {
    naver?: {
      maps: NaverMaps;
    };
    __matzipNaverMapReady?: () => void;
    navermap_authFailure?: () => void;
  }
}

type NaverMapProps = {
  places: Place[];
  selectedPlaceId?: string;
  userLocation?: UserLocation;
  focusLocation?: Pick<UserLocation, "latitude" | "longitude">;
  locationStatus?: "idle" | "requesting" | "ready" | "fallback";
  locationFocusKey?: number;
  onSelectPlace: (placeId: string) => void;
  onRequestUserLocation?: () => void;
  onVisibleBoundsChange?: (bounds: GeoBounds, areaQuery?: string) => void;
};

const MAP_SCRIPT_ID = "naver-map-script";
const MAP_READY_CALLBACK = "__matzipNaverMapReady";

export function NaverMap({
  places,
  selectedPlaceId,
  userLocation,
  focusLocation,
  locationStatus = "idle",
  locationFocusKey = 0,
  onSelectPlace,
  onRequestUserLocation,
  onVisibleBoundsChange,
}: NaverMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<NaverMap | null>(null);
  const markersRef = useRef<NaverMarker[]>([]);
  const userMarkerRef = useRef<NaverMarker | null>(null);
  const boundsReportIdRef = useRef(0);
  const lastAppliedFocusKeyRef = useRef(0);
  const [mapLoadState, setMapLoadState] = useState<"idle" | "ready" | "failed">("idle");
  const [fallbackMessage, setFallbackMessage] = useState("");
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const mapView = useMemo(
    () => getInitialMapView(places, selectedPlaceId, focusLocation ?? userLocation),
    [focusLocation, places, selectedPlaceId, userLocation]
  );

  useEffect(() => {
    if (!clientId) {
      return;
    }

    let cancelled = false;
    let authFailed = false;

    function markReady() {
      if (cancelled || authFailed) {
        return;
      }

      if (window.naver?.maps) {
        setMapLoadState("ready");
        setFallbackMessage("");
        return;
      }

      setMapLoadState("failed");
      setFallbackMessage("네이버지도 스크립트가 로드됐지만 지도 객체를 찾지 못했습니다.");
    }

    function markFailed() {
      if (!cancelled) {
        setMapLoadState("failed");
        setFallbackMessage("네이버지도 연결을 확인해 주세요.");
      }
    }

    function markAuthFailed() {
      authFailed = true;

      if (!cancelled) {
        setMapLoadState("failed");
        setFallbackMessage("네이버지도 인증에 실패했습니다. 도메인 허용 설정을 확인해 주세요.");
      }
    }

    const cleanupAuthFailure = installNaverMapAuthFailureHandler(window, markAuthFailed);

    if (window.naver?.maps) {
      markReady();
      return () => {
        cancelled = true;
        cleanupAuthFailure();
      };
    }

    window[MAP_READY_CALLBACK] = markReady;

    const existingScript = document.getElementById(MAP_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      if (existingScript.dataset.status === "failed") {
        markFailed();
      } else {
        existingScript.addEventListener("load", markReady);
        existingScript.addEventListener("error", markFailed);
      }

      return () => {
        cancelled = true;
        cleanupAuthFailure();
        existingScript.removeEventListener("load", markReady);
        existingScript.removeEventListener("error", markFailed);
      };
    }

    const script = document.createElement("script");
    script.id = MAP_SCRIPT_ID;
    script.async = true;
    script.dataset.status = "loading";
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&submodules=geocoder&callback=${MAP_READY_CALLBACK}`;
    script.addEventListener("load", () => {
      window.setTimeout(() => {
        if (window.naver?.maps) {
          script.dataset.status = "ready";
          markReady();
        } else {
          script.dataset.status = "failed";
          markFailed();
        }
      }, 0);
    });
    script.addEventListener("error", () => {
      script.dataset.status = "failed";
      markFailed();
    });
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      cleanupAuthFailure();
    };
  }, [clientId]);

  useEffect(() => {
    if (mapLoadState !== "ready" || !mapElementRef.current) {
      return;
    }

    const naverMaps = window.naver?.maps;
    if (!naverMaps) {
      return;
    }

    const center = new naverMaps.LatLng(mapView.latitude, mapView.longitude);

    if (!mapRef.current) {
      mapRef.current = new naverMaps.Map(mapElementRef.current, {
        center,
        zoom: mapView.zoom,
      });
    }
  }, [mapLoadState, mapView]);

  useEffect(() => {
    const naverMaps = window.naver?.maps;
    const map = mapRef.current;

    if (mapLoadState !== "ready" || !map || !naverMaps || !onVisibleBoundsChange) {
      return;
    }

    let cancelled = false;
    const reportVisibleBounds = () => {
      const reportId = ++boundsReportIdRef.current;
      const bounds = readNaverMapBounds(map.getBounds());

      void resolveNaverMapAreaQuery(naverMaps, bounds).then((areaQuery) => {
        if (cancelled || reportId !== boundsReportIdRef.current) {
          return;
        }

        onVisibleBoundsChange(bounds, areaQuery);
      });
    };
    reportVisibleBounds();

    const listener = naverMaps.Event.addListener(map, "idle", reportVisibleBounds);

    return () => {
      cancelled = true;
      boundsReportIdRef.current += 1;
      naverMaps.Event.removeListener(listener);
    };
  }, [mapLoadState, onVisibleBoundsChange]);

  useEffect(() => {
    const naverMaps = window.naver?.maps;
    const map = mapRef.current;

    if (mapLoadState !== "ready" || !map || !naverMaps) {
      return;
    }

    clearNaverMapMarkers(markersRef.current);
    markersRef.current = places.map((place) => {
      const thumbnailUrl = getPlaceThumbnailUrl(place);
      const summary = getPlaceMarkerSummary(place);
      const marker = new naverMaps.Marker({
        position: new naverMaps.LatLng(place.latitude, place.longitude),
        map,
        title: place.name,
        icon: {
          content: buildNaverRestaurantMarkerContent({
            name: place.name,
            thumbnailUrl,
            reviewLabel: summary.reviewLabel,
            ratingLabel: summary.ratingLabel,
            isSelected: place.id === selectedPlaceId,
          }),
          size: new naverMaps.Size(154, 62),
          anchor: new naverMaps.Point(77, 62),
        },
      });
      naverMaps.Event.addListener(marker, "click", () => onSelectPlace(place.id));
      return marker;
    });

    return () => {
      clearNaverMapMarkers(markersRef.current);
      markersRef.current = [];
    };
  }, [mapLoadState, onSelectPlace, places, selectedPlaceId]);

  useEffect(() => {
    const naverMaps = window.naver?.maps;
    const map = mapRef.current;

    if (mapLoadState !== "ready" || !map || !naverMaps || !userLocation) {
      return;
    }

    userMarkerRef.current?.setMap(null);
    userMarkerRef.current = new naverMaps.Marker({
      position: new naverMaps.LatLng(userLocation.latitude, userLocation.longitude),
      map,
      title: "내 위치",
      icon: {
        content: buildUserLocationMarkerContent(),
        size: new naverMaps.Size(26, 26),
        anchor: new naverMaps.Point(13, 13),
      },
    });

    return () => {
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = null;
    };
  }, [mapLoadState, userLocation]);

  useEffect(() => {
    const naverMaps = window.naver?.maps;
    const map = mapRef.current;

    const nextFocusLocation = focusLocation ?? userLocation;

    if (
      mapLoadState !== "ready" ||
      !map ||
      !naverMaps ||
      !nextFocusLocation ||
      !shouldApplyProgrammaticMapFocus(locationFocusKey, lastAppliedFocusKeyRef.current)
    ) {
      return;
    }

    lastAppliedFocusKeyRef.current = locationFocusKey;
    map.setCenter(new naverMaps.LatLng(nextFocusLocation.latitude, nextFocusLocation.longitude));
    map.setZoom(FOCUSED_MAP_ZOOM);
  }, [focusLocation, locationFocusKey, mapLoadState, userLocation]);

  if (!clientId || mapLoadState === "failed") {
    return (
      <FallbackMap
        places={places}
        selectedPlaceId={selectedPlaceId}
        userLocation={userLocation}
        focusLocation={focusLocation}
        locationStatus={locationStatus}
        locationFocusKey={locationFocusKey}
        onSelectPlace={onSelectPlace}
        onRequestUserLocation={onRequestUserLocation}
        onVisibleBoundsChange={onVisibleBoundsChange}
        message={
          clientId
            ? fallbackMessage || "네이버지도 연결을 확인해 주세요."
            : "네이버지도 키를 넣으면 실제 지도가 표시됩니다."
        }
      />
    );
  }

  return (
    <section className="relative min-h-[420px] overflow-hidden bg-[#dce8df] lg:min-h-screen">
      <div ref={mapElementRef} className="h-full min-h-[420px] lg:min-h-screen" />
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-md bg-white/92 px-3 py-2 text-sm font-semibold text-[#17352b] shadow-sm">
        <Navigation size={16} />
        네이버지도
      </div>
      <button
        type="button"
        onClick={onRequestUserLocation}
        disabled={!onRequestUserLocation || locationStatus === "requesting"}
        className="absolute right-4 top-4 flex h-10 items-center gap-2 rounded-md bg-white/95 px-3 text-sm font-black text-[#17352b] shadow-sm transition hover:bg-white disabled:text-[#9aaaa2]"
        aria-label="내 위치로 이동"
      >
        <LocateFixed size={17} />내 위치
      </button>
      {!places.length ? (
        <div className="pointer-events-none absolute left-4 top-16 rounded-md bg-white/92 px-3 py-2 text-sm font-semibold text-[#52635b] shadow-sm">
          맛집 데이터를 가져오면 핀이 표시됩니다.
        </div>
      ) : null}
    </section>
  );
}

function FallbackMap({
  places,
  selectedPlaceId,
  userLocation,
  focusLocation,
  locationStatus,
  onSelectPlace,
  onRequestUserLocation,
  onVisibleBoundsChange,
  message,
}: NaverMapProps & { message: string }) {
  const placesWithUserLocation = useMemo(() => {
    if (!userLocation) {
      return places;
    }

    return [
      ...places,
      {
        id: "__user-location",
        name: "내 위치",
        address: "",
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        categoryId: "local" as const,
        tagIds: [],
        ownerAnonymousId: "system",
        status: "public" as const,
      },
    ];
  }, [places, userLocation]);
  const markerLayout = useMemo(
    () => getFallbackMapMarkers(placesWithUserLocation, selectedPlaceId),
    [placesWithUserLocation, selectedPlaceId]
  );
  const markerLayoutById = useMemo(
    () => new Map(markerLayout.map((marker) => [marker.id, marker])),
    [markerLayout]
  );
  const userMarker = markerLayoutById.get("__user-location");

  useEffect(() => {
    if (!onVisibleBoundsChange) {
      return;
    }

    if (locationStatus !== "ready" && locationStatus !== "fallback") {
      return;
    }

    const center = focusLocation ?? userLocation ?? places[0];

    if (!center) {
      return;
    }

    onVisibleBoundsChange(getCenteredGeoBounds(center));
  }, [focusLocation, locationStatus, onVisibleBoundsChange, places, userLocation]);

  return (
    <section className="relative min-h-[420px] overflow-hidden bg-[#dfe9e1] lg:min-h-screen">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(24,52,43,.08)_1px,transparent_1px),linear-gradient(rgba(24,52,43,.08)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0_42%,rgba(255,255,255,.45)_42%_44%,transparent_44%_100%),linear-gradient(35deg,transparent_0_56%,rgba(15,122,95,.16)_56%_58%,transparent_58%_100%)]" />
      <div className="absolute left-4 top-4 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-md bg-white/92 px-3 py-2 text-sm font-semibold text-[#17352b] shadow-sm">
        <MapPin size={16} />
        {message}
      </div>
      <button
        type="button"
        onClick={onRequestUserLocation}
        disabled={!onRequestUserLocation || locationStatus === "requesting"}
        className="absolute right-4 top-4 flex h-10 items-center gap-2 rounded-md bg-white/95 px-3 text-sm font-black text-[#17352b] shadow-sm transition hover:bg-white disabled:text-[#9aaaa2]"
        aria-label="내 위치로 이동"
      >
        <LocateFixed size={17} />내 위치
      </button>
      {!places.length ? (
        <div className="absolute left-4 top-16 rounded-md bg-white/92 px-3 py-2 text-sm font-semibold text-[#52635b] shadow-sm">
          맛집 데이터를 가져오면 핀이 표시됩니다.
        </div>
      ) : null}
      {userMarker ? (
        <div
          className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-[#1c6df2] shadow-lg"
          style={{ left: `${userMarker.left}%`, top: `${userMarker.top}%` }}
          aria-label="내 위치"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
        </div>
      ) : null}
      {places.map((place) => {
        const marker = markerLayoutById.get(place.id);
        if (!marker) {
          return null;
        }
        const thumbnailUrl = getPlaceThumbnailUrl(place);

        return (
          <button
            key={place.id}
            type="button"
            onClick={() => onSelectPlace(place.id)}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
            aria-label={`${place.name} 선택`}
          >
            <span
              className={`grid h-14 w-14 place-items-center overflow-hidden rounded-md border-2 shadow-lg transition ${
                marker.isSelected
                  ? "border-[#17352b] bg-[#e85d4f] text-white ring-4 ring-white/75"
                  : "border-white bg-[#0f7a5f] text-white"
              }`}
            >
              {thumbnailUrl ? (
                <span
                  role="img"
                  aria-label={`${place.name} 사진`}
                  className="h-full w-full bg-cover bg-center"
                  style={imageBackground(thumbnailUrl)}
                />
              ) : (
                <MapPin size={22} fill="currentColor" />
              )}
            </span>
            {marker.showLabel ? (
              <span className="max-w-40 rounded-md bg-white/95 px-2 py-1 text-left text-xs font-semibold text-[#17352b] shadow-sm">
                <span className="block truncate">{place.name}</span>
                <span className="block text-[11px] text-[#70847b]">
                  {getPlaceMarkerSummary(place).reviewLabel}
                </span>
              </span>
            ) : null}
          </button>
        );
      })}
    </section>
  );
}

function getPlaceThumbnailUrl(place: Pick<Place, "heroImageUrl">) {
  return place.heroImageUrl?.trim() ?? "";
}

function imageBackground(url: string) {
  return {
    backgroundImage: `url("${url.replace(/"/g, '\\"')}")`,
  };
}

function resolveNaverMapAreaQuery(naverMaps: NaverMaps, bounds: GeoBounds) {
  const service = naverMaps.Service;

  if (!service?.reverseGeocode) {
    return Promise.resolve(undefined);
  }

  const center = {
    latitude: (bounds.south + bounds.north) / 2,
    longitude: (bounds.west + bounds.east) / 2,
  };
  const coords = new naverMaps.LatLng(center.latitude, center.longitude);
  const orders = [
    service.OrderType?.ADDR ?? "addr",
    service.OrderType?.ROAD_ADDR ?? "roadaddr",
  ].join(",");

  return new Promise<string | undefined>((resolve) => {
    let settled = false;
    const resolveOnce = (areaQuery?: string) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      resolve(areaQuery);
    };
    const timeoutId = window.setTimeout(() => resolveOnce(), 900);

    service.reverseGeocode?.(
      {
        coords,
        sourcecrs: service.CoordinatesType?.LATLNG,
        targetcrs: service.CoordinatesType?.LATLNG,
        orders,
      },
      (status, response) => {
        if (status !== (service.Status?.OK ?? 200)) {
          resolveOnce();
          return;
        }

        resolveOnce(getAreaQueryFromNaverReverseGeocodeResponse(response));
      }
    );
  });
}

function getAreaQueryFromNaverReverseGeocodeResponse(response?: NaverReverseGeocodeResponse) {
  const status = response?.v2?.status;

  if (status && status.code !== 0 && status.name !== "ok") {
    return undefined;
  }

  const region = response?.v2?.results?.[0]?.region;

  return [region?.area3?.name, region?.area4?.name, region?.area2?.name, region?.area1?.name]
    .map((areaName) => areaName?.trim())
    .find((areaName): areaName is string => Boolean(areaName));
}

function buildNaverRestaurantMarkerContent({
  name,
  thumbnailUrl,
  reviewLabel,
  ratingLabel,
  isSelected,
}: {
  name: string;
  thumbnailUrl?: string;
  reviewLabel: string;
  ratingLabel: string;
  isSelected: boolean;
}) {
  const borderColor = isSelected ? "#17352b" : "#ffffff";
  const boxShadow = isSelected
    ? "0 0 0 4px rgba(255,255,255,.82), 0 12px 26px rgba(23,53,43,.28)"
    : "0 10px 22px rgba(23,53,43,.24)";
  const thumbnail = thumbnailUrl
    ? `<img src="${escapeAttribute(thumbnailUrl)}" alt="${escapeAttribute(
        name
      )} 사진" style="width:34px;height:34px;border-radius:6px;object-fit:cover;flex:0 0 auto;" />`
    : '<span style="width:34px;height:34px;border-radius:6px;background:#eef8f2;color:#0f7a5f;display:grid;place-items:center;flex:0 0 auto;font-weight:900;">맛</span>';

  return `<div style="width:154px;min-height:54px;box-sizing:border-box;border:2px solid ${borderColor};border-radius:8px;background:#fff;box-shadow:${boxShadow};display:flex;gap:8px;align-items:center;padding:8px;color:#17352b;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    ${thumbnail}
    <span style="min-width:0;display:block;line-height:1.2;">
      <strong style="display:block;max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;">${escapeAttribute(
        name
      )}</strong>
      <span style="display:block;margin-top:3px;font-size:11px;font-weight:800;color:#0f7a5f;">${escapeAttribute(
        ratingLabel
      )}</span>
      <span style="display:block;margin-top:2px;font-size:11px;font-weight:700;color:#70847b;">${escapeAttribute(
        reviewLabel
      )}</span>
    </span>
  </div>`;
}

function buildUserLocationMarkerContent() {
  return '<div style="width:26px;height:26px;border:3px solid #fff;border-radius:999px;background:#1c6df2;box-shadow:0 8px 18px rgba(28,109,242,.35);display:grid;place-items:center;"><span style="width:8px;height:8px;border-radius:999px;background:#fff;display:block;"></span></div>';
}

function escapeAttribute(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

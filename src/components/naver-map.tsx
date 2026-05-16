"use client";

import { MapPin, Navigation } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Place } from "@/lib/domain";
import { getInitialMapView } from "@/lib/map-view";

type NaverLatLng = object;
type NaverMap = {
  setCenter(position: NaverLatLng): void;
  setZoom(zoom: number): void;
};
type NaverMarker = {
  setMap(map: NaverMap | null): void;
};
type NaverMaps = {
  LatLng: new (latitude: number, longitude: number) => NaverLatLng;
  Map: new (
    element: HTMLElement,
    options: { center: NaverLatLng; zoom: number; minZoom?: number }
  ) => NaverMap;
  Marker: new (options: { position: NaverLatLng; map: NaverMap; title: string }) => NaverMarker;
  Event: {
    addListener(target: NaverMarker, eventName: string, listener: () => void): void;
  };
};

declare global {
  interface Window {
    naver?: {
      maps: NaverMaps;
    };
    __matzipNaverMapReady?: () => void;
  }
}

type NaverMapProps = {
  places: Place[];
  selectedPlaceId?: string;
  onSelectPlace: (placeId: string) => void;
};

const MAP_SCRIPT_ID = "naver-map-script";
const MAP_READY_CALLBACK = "__matzipNaverMapReady";

export function NaverMap({ places, selectedPlaceId, onSelectPlace }: NaverMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<NaverMap | null>(null);
  const markersRef = useRef<NaverMarker[]>([]);
  const [mapLoadState, setMapLoadState] = useState<"idle" | "ready" | "failed">("idle");
  const [fallbackMessage, setFallbackMessage] = useState("");
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const mapView = useMemo(
    () => getInitialMapView(places, selectedPlaceId),
    [places, selectedPlaceId]
  );

  useEffect(() => {
    if (!clientId) {
      return;
    }

    let cancelled = false;

    function markReady() {
      if (cancelled) {
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

    if (window.naver?.maps) {
      markReady();
      return () => {
        cancelled = true;
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
        minZoom: 6,
      });
    } else {
      mapRef.current.setCenter(center);
      mapRef.current.setZoom(mapView.zoom);
    }
  }, [mapLoadState, mapView]);

  useEffect(() => {
    const naverMaps = window.naver?.maps;
    const map = mapRef.current;

    if (mapLoadState !== "ready" || !map || !naverMaps) {
      return;
    }

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = places.map((place) => {
      const marker = new naverMaps.Marker({
        position: new naverMaps.LatLng(place.latitude, place.longitude),
        map,
        title: place.name,
      });
      naverMaps.Event.addListener(marker, "click", () => onSelectPlace(place.id));
      return marker;
    });

    return () => {
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [mapLoadState, onSelectPlace, places]);

  if (!clientId || mapLoadState === "failed") {
    return (
      <FallbackMap
        places={places}
        selectedPlaceId={selectedPlaceId}
        onSelectPlace={onSelectPlace}
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
  onSelectPlace,
  message,
}: NaverMapProps & { message: string }) {
  const bounds = useMemo(() => {
    if (!places.length) {
      return {
        minLat: 37.4565,
        maxLat: 37.6765,
        minLng: 126.868,
        maxLng: 127.088,
      };
    }

    const latitudes = places.map((place) => place.latitude);
    const longitudes = places.map((place) => place.longitude);

    return {
      minLat: Math.min(...latitudes),
      maxLat: Math.max(...latitudes),
      minLng: Math.min(...longitudes),
      maxLng: Math.max(...longitudes),
    };
  }, [places]);

  return (
    <section className="relative min-h-[420px] overflow-hidden bg-[#dfe9e1] lg:min-h-screen">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(24,52,43,.08)_1px,transparent_1px),linear-gradient(rgba(24,52,43,.08)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0_42%,rgba(255,255,255,.45)_42%_44%,transparent_44%_100%),linear-gradient(35deg,transparent_0_56%,rgba(15,122,95,.16)_56%_58%,transparent_58%_100%)]" />
      <div className="absolute left-4 top-4 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-md bg-white/92 px-3 py-2 text-sm font-semibold text-[#17352b] shadow-sm">
        <MapPin size={16} />
        {message}
      </div>
      {!places.length ? (
        <div className="absolute left-4 top-16 rounded-md bg-white/92 px-3 py-2 text-sm font-semibold text-[#52635b] shadow-sm">
          맛집 데이터를 가져오면 핀이 표시됩니다.
        </div>
      ) : null}
      {places.map((place) => {
        const left = toPercent(place.longitude, bounds.minLng, bounds.maxLng);
        const top = 100 - toPercent(place.latitude, bounds.minLat, bounds.maxLat);
        const isSelected = place.id === selectedPlaceId;

        return (
          <button
            key={place.id}
            type="button"
            onClick={() => onSelectPlace(place.id)}
            className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1"
            style={{ left: `${left}%`, top: `${top}%` }}
            aria-label={`${place.name} 선택`}
          >
            <span
              className={`grid h-10 w-10 place-items-center rounded-full border-2 shadow-lg transition ${
                isSelected
                  ? "border-[#17352b] bg-[#e85d4f] text-white"
                  : "border-white bg-[#0f7a5f] text-white"
              }`}
            >
              <MapPin size={20} fill="currentColor" />
            </span>
            <span className="max-w-32 rounded-md bg-white/95 px-2 py-1 text-xs font-semibold text-[#17352b] shadow-sm">
              {place.name}
            </span>
          </button>
        );
      })}
    </section>
  );
}

function toPercent(value: number, min: number, max: number) {
  if (min === max) {
    return 50;
  }

  return 8 + ((value - min) / (max - min)) * 84;
}

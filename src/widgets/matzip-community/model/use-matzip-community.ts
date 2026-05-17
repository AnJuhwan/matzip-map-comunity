"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type CategoryId,
  type CommunityDataScope,
  type GeoBounds,
  type Place,
  type PlaceDraft,
  type PlaceWithDistance,
  type Review,
  type UserLocation,
  DEFAULT_USER_LOCATION,
  attachPlaceStats,
  ensureAnonymousProfile,
  getVisiblePlaces,
  isSupabaseConfigured,
  loadCommunityData,
  makeAnonymousNickname,
  reportContent,
  savePlace,
  saveReview,
  softDeleteContent,
  updateNickname,
  type AnonymousProfile,
} from "@/entities/community";
import type { NearbyPlaceCandidate } from "@/features/naver-place-import";
import { getCenteredGeoBounds } from "@/features/place-map/model/map-view";

export type PanelMode = "browse" | "new-place" | "edit-place";
export type LocationStatus = "idle" | "requesting" | "ready" | "fallback";

type GeocodeResult = {
  address: string;
  latitude: number;
  longitude: number;
  source: "naver" | "naver-local-search" | "fallback";
};

type CandidateLookupLocation = Pick<UserLocation, "latitude" | "longitude"> &
  Partial<Pick<UserLocation, "source">>;

export function getNearbyCandidateCategoryParam(areaQuery?: string) {
  void areaQuery;
  return "food";
}

export function shouldLoadNearbyCandidates(areaQuery?: string) {
  void areaQuery;
  return true;
}

export function getGeoBoundsCenter(bounds: GeoBounds) {
  return {
    latitude: (bounds.south + bounds.north) / 2,
    longitude: (bounds.west + bounds.east) / 2,
  };
}

export function useMatzipCommunity(initialSearchQuery = "") {
  const initialAppliedQuery = normalizeSearchInput(initialSearchQuery);
  const [profile, setProfile] = useState<AnonymousProfile | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [userLocation, setUserLocation] = useState<UserLocation>(DEFAULT_USER_LOCATION);
  const [mapFocusLocation, setMapFocusLocation] =
    useState<Pick<UserLocation, "latitude" | "longitude">>(DEFAULT_USER_LOCATION);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationFocusKey, setLocationFocusKey] = useState(0);
  const [visibleMapBounds, setVisibleMapBounds] = useState<GeoBounds | null>(null);
  const [nearbyCandidates, setNearbyCandidates] = useState<NearbyPlaceCandidate[]>([]);
  const [candidateMessage, setCandidateMessage] = useState("");
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>();
  const [panelMode, setPanelMode] = useState<PanelMode>("browse");
  const [activeCategoryId, setActiveCategoryId] = useState<CategoryId | "all">("all");
  const [query, setQuery] = useState(initialAppliedQuery);
  const [appliedQuery, setAppliedQuery] = useState(initialAppliedQuery);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [message, setMessage] = useState("");
  const dataLoadIdRef = useRef(0);
  const dataScopeRef = useRef<CommunityDataScope | null>(null);
  const candidateLoadIdRef = useRef(0);
  const locationStatusRef = useRef<LocationStatus>("idle");
  const mapFocusLocationRef =
    useRef<Pick<UserLocation, "latitude" | "longitude">>(DEFAULT_USER_LOCATION);
  const visibleMapBoundsRef = useRef<GeoBounds | null>(null);
  const visibleMapBoundsKeyRef = useRef("");
  const visibleMapAreaQueryRef = useRef("");
  const trustedSearchFocusQueryRef = useRef("");
  const inFlightCandidateRequestKeyRef = useRef("");
  const lastCompletedCandidateRequestKeyRef = useRef("");
  const initialSearchHandledRef = useRef(false);

  useEffect(() => {
    locationStatusRef.current = locationStatus;
  }, [locationStatus]);

  useEffect(() => {
    mapFocusLocationRef.current = mapFocusLocation;
  }, [mapFocusLocation]);

  useEffect(() => {
    visibleMapBoundsRef.current = visibleMapBounds;
  }, [visibleMapBounds]);

  const refreshData = useCallback(async (scope?: CommunityDataScope) => {
    const nextScope = scope ?? dataScopeRef.current;

    if (!nextScope) {
      return;
    }

    dataScopeRef.current = nextScope;
    const loadId = ++dataLoadIdRef.current;
    const data = await loadCommunityData(nextScope);

    if (loadId !== dataLoadIdRef.current) {
      return;
    }

    setReviews(data.reviews);
    setPlaces(data.places);
    setSelectedPlaceId((current) =>
      current && data.places.some((place) => place.id === current) ? current : undefined
    );
  }, []);

  const requestUserLocation = useCallback(() => {
    locationStatusRef.current = "requesting";
    setLocationStatus("requesting");

    if (!navigator.geolocation) {
      visibleMapBoundsKeyRef.current = "";
      visibleMapAreaQueryRef.current = "";
      visibleMapBoundsRef.current = null;
      mapFocusLocationRef.current = DEFAULT_USER_LOCATION;
      locationStatusRef.current = "fallback";
      setVisibleMapBounds(null);
      setUserLocation(DEFAULT_USER_LOCATION);
      setMapFocusLocation(DEFAULT_USER_LOCATION);
      setLocationStatus("fallback");
      setLocationFocusKey((current) => current + 1);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        visibleMapBoundsKeyRef.current = "";
        visibleMapAreaQueryRef.current = "";
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: "browser",
        } satisfies UserLocation;

        visibleMapBoundsRef.current = null;
        mapFocusLocationRef.current = nextLocation;
        locationStatusRef.current = "ready";
        setVisibleMapBounds(null);
        setUserLocation(nextLocation);
        setMapFocusLocation(nextLocation);
        setLocationStatus("ready");
        setLocationFocusKey((current) => current + 1);
      },
      () => {
        visibleMapBoundsKeyRef.current = "";
        visibleMapAreaQueryRef.current = "";
        visibleMapBoundsRef.current = null;
        mapFocusLocationRef.current = DEFAULT_USER_LOCATION;
        locationStatusRef.current = "fallback";
        setVisibleMapBounds(null);
        setUserLocation(DEFAULT_USER_LOCATION);
        setMapFocusLocation(DEFAULT_USER_LOCATION);
        setLocationStatus("fallback");
        setLocationFocusKey((current) => current + 1);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 5_000,
      }
    );
  }, []);

  useEffect(() => {
    let ignore = false;

    async function boot() {
      setIsBooting(true);
      setMessage("");

      try {
        const nextProfile = await ensureAnonymousProfile();

        if (ignore) {
          return;
        }

        setProfile(nextProfile);
        setNicknameDraft(nextProfile.nickname);
      } catch (error) {
        if (!ignore) {
          setMessage(error instanceof Error ? error.message : "초기화 실패");
        }
      } finally {
        if (!ignore) {
          setIsBooting(false);
        }
      }
    }

    boot();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    requestUserLocation();
  }, [requestUserLocation]);

  const loadNearbyCandidates = useCallback(
    async (
      searchQuery?: string,
      signal?: AbortSignal,
      locationOverride?: CandidateLookupLocation,
      boundsOverride?: GeoBounds | null,
      areaQueryOverride?: string | null
    ) => {
      const candidateLocation = locationOverride ?? mapFocusLocationRef.current;
      const trimmedSearchQuery = normalizeSearchInput(searchQuery);
      const candidateBounds =
        boundsOverride ?? visibleMapBoundsRef.current ?? getCenteredGeoBounds(candidateLocation);
      const categories = getNearbyCandidateCategoryParam(trimmedSearchQuery);
      const areaQuery = normalizeSearchInput(areaQueryOverride);

      if (
        !canUseCandidateLookupLocation({
          locationStatus: locationStatusRef.current,
          locationOverride,
        })
      ) {
        return;
      }

      const requestKey = buildNearbyCandidateRequestKey({
        searchQuery: trimmedSearchQuery,
        areaQuery,
        categories,
        location: candidateLocation,
        bounds: candidateBounds,
      });

      if (
        requestKey === inFlightCandidateRequestKeyRef.current ||
        requestKey === lastCompletedCandidateRequestKeyRef.current
      ) {
        return;
      }

      const loadId = ++candidateLoadIdRef.current;
      const shouldApply = () => loadId === candidateLoadIdRef.current && !signal?.aborted;
      inFlightCandidateRequestKeyRef.current = requestKey;
      setIsLoadingCandidates(true);
      setCandidateMessage("");

      try {
        const searchParams = new URLSearchParams({
          latitude: String(candidateLocation.latitude),
          longitude: String(candidateLocation.longitude),
          categories,
        });

        searchParams.set("south", String(candidateBounds.south));
        searchParams.set("north", String(candidateBounds.north));
        searchParams.set("west", String(candidateBounds.west));
        searchParams.set("east", String(candidateBounds.east));

        if (trimmedSearchQuery) {
          searchParams.set("query", trimmedSearchQuery);
        } else if (areaQuery) {
          searchParams.set("areaQuery", areaQuery);
        }

        const response = await fetch(`/api/nearby-place-candidates?${searchParams.toString()}`, {
          signal,
        });
        const body = (await response.json()) as {
          places?: NearbyPlaceCandidate[];
          warning?: string;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(body.error ?? "네이버 후보를 가져오지 못했습니다.");
        }

        if (shouldApply()) {
          setNearbyCandidates(body.places ?? []);
          setCandidateMessage(body.warning ?? "");
          lastCompletedCandidateRequestKeyRef.current = requestKey;
        }
      } catch (error) {
        if (shouldApply()) {
          setNearbyCandidates([]);
          setCandidateMessage(
            error instanceof Error ? error.message : "네이버 후보를 가져오지 못했습니다."
          );
        }
      } finally {
        if (inFlightCandidateRequestKeyRef.current === requestKey) {
          inFlightCandidateRequestKeyRef.current = "";
        }

        if (shouldApply()) {
          setIsLoadingCandidates(false);
        }
      }
    },
    []
  );

  const visibleReviews = useMemo(
    () => reviews.filter((review) => review.status === "public"),
    [reviews]
  );
  const visiblePlaces = useMemo(
    () => getVisiblePlaces(places).map((place) => attachPlaceStats(place, visibleReviews)),
    [places, visibleReviews]
  );
  const mapScopedPlaces = useMemo(
    () =>
      visibleMapBounds
        ? visiblePlaces.filter((place) => isPointInBounds(place, visibleMapBounds))
        : [],
    [visibleMapBounds, visiblePlaces]
  );
  const filteredPlaces = useMemo(() => {
    return mapScopedPlaces.filter((place) => {
      const categoryMatch = activeCategoryId === "all" || place.categoryId === activeCategoryId;

      return categoryMatch;
    });
  }, [activeCategoryId, mapScopedPlaces]);
  const filteredCandidates = useMemo(() => {
    const normalizedQuery = appliedQuery.trim().toLowerCase();

    return nearbyCandidates.filter((candidate) => {
      const categoryMatch = activeCategoryId === "all" || candidate.categoryId === activeCategoryId;
      const queryMatch = matchesSearch(candidate, normalizedQuery);
      const boundsMatch = !visibleMapBounds || isPointInBounds(candidate, visibleMapBounds);

      return categoryMatch && queryMatch && boundsMatch;
    });
  }, [activeCategoryId, appliedQuery, nearbyCandidates, visibleMapBounds]);
  const candidateMapPlaces = useMemo(
    () => filteredCandidates.map(mapCandidateToPlace),
    [filteredCandidates]
  );
  const mapPlaces = useMemo(
    () => [...filteredPlaces, ...candidateMapPlaces],
    [candidateMapPlaces, filteredPlaces]
  );
  const selectedPlace =
    filteredPlaces.find((place) => place.id === selectedPlaceId) ?? filteredPlaces[0];
  const selectedReviews = visibleReviews.filter((review) => review.placeId === selectedPlace?.id);

  async function handleNicknameSave() {
    if (!profile) {
      return;
    }

    try {
      const nextProfile = await updateNickname(profile, nicknameDraft);
      setProfile(nextProfile);
      setNicknameDraft(nextProfile.nickname);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "닉네임 저장 실패");
    }
  }

  function handleNicknameRandomize() {
    setNicknameDraft(makeAnonymousNickname(Date.now()));
  }

  const moveToSearchQueryLocation = useCallback(
    async (nextQuery: string) => {
      try {
        const geocode = await geocodeQuery(nextQuery);

        if (geocode.source === "fallback") {
          throw new Error("검색 위치를 찾지 못했습니다.");
        }

        const nextLocation: UserLocation = {
          latitude: geocode.latitude,
          longitude: geocode.longitude,
          source: "search",
        };
        visibleMapBoundsKeyRef.current = "";
        visibleMapAreaQueryRef.current = "";
        trustedSearchFocusQueryRef.current = nextQuery;
        visibleMapBoundsRef.current = null;
        mapFocusLocationRef.current = nextLocation;
        setVisibleMapBounds(null);
        setMapFocusLocation(nextLocation);
        setLocationFocusKey((current) => current + 1);

        await loadNearbyCandidates(nextQuery, undefined, nextLocation);
      } catch {
        await loadNearbyCandidates(nextQuery);
      }
    },
    [loadNearbyCandidates]
  );

  function handleSearchSubmit() {
    const nextQuery = query.trim();
    trustedSearchFocusQueryRef.current = "";
    setAppliedQuery(nextQuery);
    setSelectedPlaceId(undefined);

    if (nextQuery) {
      void moveToSearchQueryLocation(nextQuery);
      return;
    }

    if (visibleMapBounds) {
      void loadNearbyCandidates(
        "",
        undefined,
        getGeoBoundsCenter(visibleMapBounds),
        visibleMapBounds,
        visibleMapAreaQueryRef.current
      );
    }
  }

  useEffect(() => {
    if (initialSearchHandledRef.current || !initialAppliedQuery) {
      return;
    }

    if (locationStatus !== "ready" && locationStatus !== "fallback") {
      return;
    }

    initialSearchHandledRef.current = true;
    void moveToSearchQueryLocation(initialAppliedQuery);
  }, [initialAppliedQuery, locationStatus, moveToSearchQueryLocation]);

  async function geocodeQuery(searchQuery: string): Promise<GeocodeResult> {
    const response = await fetch(`/api/geocode?query=${encodeURIComponent(searchQuery)}`);
    const body = (await response.json()) as Partial<GeocodeResult> & { error?: string };

    if (!response.ok) {
      throw new Error(body.error ?? "검색 위치를 찾지 못했습니다.");
    }

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("검색 위치 좌표가 올바르지 않습니다.");
    }

    return {
      address: body.address ?? searchQuery,
      latitude,
      longitude,
      source: body.source ?? "fallback",
    };
  }

  const handleVisibleBoundsChange = useCallback(
    (bounds: GeoBounds, areaQuery?: string) => {
      if (
        !canUseVisibleBoundsForLookup(
          locationStatusRef.current,
          appliedQuery,
          trustedSearchFocusQueryRef.current
        )
      ) {
        return;
      }

      const boundsKey = getBoundsKey(bounds);
      const nextAreaQuery = normalizeSearchInput(areaQuery);

      if (
        boundsKey === visibleMapBoundsKeyRef.current &&
        nextAreaQuery === visibleMapAreaQueryRef.current
      ) {
        return;
      }

      const nextMapFocusLocation = getGeoBoundsCenter(bounds);

      visibleMapBoundsKeyRef.current = boundsKey;
      visibleMapAreaQueryRef.current = nextAreaQuery;
      visibleMapBoundsRef.current = bounds;
      mapFocusLocationRef.current = nextMapFocusLocation;
      setVisibleMapBounds(bounds);
      setMapFocusLocation(nextMapFocusLocation);
      refreshData({ bounds }).catch((error) => {
        setMessage(
          error instanceof Error ? error.message : "지도 화면 맛집을 가져오지 못했습니다."
        );
      });

      void loadNearbyCandidates(
        appliedQuery,
        undefined,
        nextMapFocusLocation,
        bounds,
        nextAreaQuery
      );
    },
    [appliedQuery, loadNearbyCandidates, refreshData]
  );

  const handleRequestUserLocation = useCallback(() => {
    trustedSearchFocusQueryRef.current = "";
    setQuery("");
    setAppliedQuery("");
    requestUserLocation();
  }, [requestUserLocation]);

  async function handleSavePlace(input: {
    id?: string;
    draft: PlaceDraft;
    imageFile?: File | null;
  }) {
    if (!profile) {
      return;
    }

    const saved = await savePlace({
      ...input,
      activeAnonymousId: profile.id,
    });

    setPlaces((current) =>
      input.id
        ? current.map((place) => (place.id === input.id ? saved : place))
        : [saved, ...current]
    );
    setSelectedPlaceId(saved.id);
    setPanelMode("browse");
    await refreshData();
    return saved;
  }

  async function handleSaveReview(input: {
    id?: string;
    review: Omit<Review, "id" | "status" | "createdAt">;
    imageFile?: File | null;
  }) {
    if (!profile) {
      return;
    }

    const saved = await saveReview({
      ...input,
      activeAnonymousId: profile.id,
    });

    setReviews((current) =>
      input.id
        ? current.map((review) => (review.id === input.id ? saved : review))
        : [saved, ...current]
    );
    setEditingReview(null);
    await refreshData();
  }

  async function handleDelete(type: "place" | "review", id: string) {
    if (!profile) {
      return;
    }

    const confirmed = window.confirm("삭제하면 공개 목록에서 사라집니다.");
    if (!confirmed) {
      return;
    }

    await softDeleteContent({
      type,
      id,
      activeAnonymousId: profile.id,
    });

    if (type === "place") {
      setPlaces((current) =>
        current.map((place) => (place.id === id ? { ...place, status: "deleted" } : place))
      );
      setSelectedPlaceId((current) => (current === id ? undefined : current));
    } else {
      setReviews((current) =>
        current.map((review) => (review.id === id ? { ...review, status: "deleted" } : review))
      );
    }

    await refreshData();
  }

  async function handleReport(targetType: "place" | "review", targetId: string) {
    if (!profile) {
      return;
    }

    try {
      await reportContent({
        targetType,
        targetId,
        reporterAnonymousId: profile.id,
        reason: "부적절하거나 정확하지 않은 내용",
      });
      window.alert("신고가 접수되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "신고 실패");
    }
  }

  return {
    profile,
    selectedPlaceId,
    setSelectedPlaceId,
    panelMode,
    setPanelMode,
    activeCategoryId,
    setActiveCategoryId,
    query,
    setQuery,
    appliedQuery,
    userLocation,
    mapFocusLocation,
    locationStatus,
    locationFocusKey,
    nicknameDraft,
    setNicknameDraft,
    editingReview,
    setEditingReview,
    isBooting,
    message,
    candidateMessage,
    isLoadingCandidates,
    visiblePlaces,
    filteredPlaces,
    filteredCandidates,
    mapPlaces,
    selectedPlace,
    selectedReviews,
    isSupabaseReady: isSupabaseConfigured(),
    handleRequestUserLocation,
    handleVisibleBoundsChange,
    handleSearchSubmit,
    handleNicknameSave,
    handleNicknameRandomize,
    handleSavePlace,
    handleSaveReview,
    handleDelete,
    handleReport,
  };
}

function matchesSearch(
  item: Pick<PlaceWithDistance, "name" | "address" | "tagIds"> & { sourceQuery?: string },
  normalizedQuery: string
) {
  return (
    !normalizedQuery ||
    `${item.name} ${item.address} ${item.tagIds.join(" ")} ${item.sourceQuery ?? ""}`
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

function isPointInBounds(
  point: Pick<PlaceWithDistance, "latitude" | "longitude">,
  bounds: GeoBounds
) {
  return (
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north &&
    point.longitude >= bounds.west &&
    point.longitude <= bounds.east
  );
}

function getBoundsKey(bounds: GeoBounds) {
  return [bounds.south, bounds.north, bounds.west, bounds.east]
    .map((value) => value.toFixed(5))
    .join(":");
}

function mapCandidateToPlace(candidate: NearbyPlaceCandidate): PlaceWithDistance {
  return {
    id: candidate.tempId,
    naverPlaceKey: candidate.naverPlaceKey,
    name: candidate.name,
    address: candidate.address,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    categoryId: candidate.categoryId,
    tagIds: candidate.tagIds,
    ownerAnonymousId: "naver-candidate",
    heroImageUrl: candidate.heroImageUrl,
    photoUrls: candidate.photoUrls,
    status: "public",
    reviewCount: 0,
    averageRevisitScore: 0,
    distanceMeters: candidate.distanceMeters,
  };
}

function normalizeSearchInput(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function buildNearbyCandidateRequestKey({
  searchQuery,
  areaQuery,
  categories,
  location,
  bounds,
}: {
  searchQuery?: string;
  areaQuery?: string;
  categories: string;
  location: Pick<UserLocation, "latitude" | "longitude">;
  bounds: GeoBounds;
}) {
  return [
    `query=${normalizeSearchInput(searchQuery)}`,
    `area=${normalizeSearchInput(areaQuery)}`,
    `categories=${categories}`,
    `location=${formatCoordinate(location.latitude)}:${formatCoordinate(location.longitude)}`,
    `bounds=${formatCoordinate(bounds.south)}:${formatCoordinate(bounds.north)}:${formatCoordinate(
      bounds.west
    )}:${formatCoordinate(bounds.east)}`,
  ].join("|");
}

function canUseCandidateLookupLocation({
  locationStatus,
  locationOverride,
}: {
  locationStatus: LocationStatus;
  locationOverride?: CandidateLookupLocation;
}) {
  if (locationOverride?.source === "search") {
    return true;
  }

  return locationStatus === "ready";
}

function canUseVisibleBoundsForLookup(
  locationStatus: LocationStatus,
  appliedQuery: string,
  trustedSearchFocusQuery: string
) {
  return (
    locationStatus === "ready" ||
    (Boolean(normalizeSearchInput(appliedQuery)) &&
      normalizeSearchInput(appliedQuery) === normalizeSearchInput(trustedSearchFocusQuery))
  );
}

function formatCoordinate(value: number) {
  return value.toFixed(5);
}

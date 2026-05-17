"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  type CategoryId,
  type Place,
  type PlaceDraft,
  findDuplicatePlaces,
} from "@/entities/community";

type GeocodeResult = {
  address: string;
  latitude: number;
  longitude: number;
  source: "naver" | "naver-local-search" | "fallback";
};

export type PlaceFormProps = {
  ownerAnonymousId: string;
  places: Place[];
  editingPlace?: Place | null;
  onCancel: () => void;
  onSave: (input: { id?: string; draft: PlaceDraft; imageFile?: File | null }) => Promise<void>;
};

type UsePlaceFormOptions = Omit<PlaceFormProps, "onCancel">;

export function usePlaceForm({
  ownerAnonymousId,
  places,
  editingPlace,
  onSave,
}: UsePlaceFormOptions) {
  const [name, setName] = useState(editingPlace?.name ?? "");
  const [address, setAddress] = useState(editingPlace?.address ?? "");
  const [categoryId, setCategoryId] = useState<CategoryId>(editingPlace?.categoryId ?? "budget");
  const [tagIds, setTagIds] = useState<string[]>(editingPlace?.tagIds ?? []);
  const [geocode, setGeocode] = useState<GeocodeResult | null>(
    editingPlace
      ? {
          address: editingPlace.address,
          latitude: editingPlace.latitude,
          longitude: editingPlace.longitude,
          source: "naver",
        }
      : null
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const duplicates = useMemo(() => {
    if (!geocode || !name.trim()) {
      return [];
    }

    return findDuplicatePlaces(
      {
        name,
        address: geocode.address,
        latitude: geocode.latitude,
        longitude: geocode.longitude,
      },
      places.filter((place) => place.id !== editingPlace?.id)
    );
  }, [editingPlace?.id, geocode, name, places]);

  async function handleSearchAddress() {
    setMessage("");
    setIsSearching(true);

    try {
      const response = await fetch(`/api/geocode?query=${encodeURIComponent(address)}`);
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "주소를 찾지 못했습니다.");
      }

      setAddress(body.address);
      setGeocode(body as GeocodeResult);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "주소 검색 실패");
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!geocode) {
      setMessage("주소 검색으로 지도 핀을 먼저 확인해주세요.");
      return;
    }

    setIsSaving(true);

    try {
      await onSave({
        id: editingPlace?.id,
        draft: {
          name,
          address: geocode.address,
          latitude: geocode.latitude,
          longitude: geocode.longitude,
          categoryId,
          tagIds,
          ownerAnonymousId,
          heroImageUrl: editingPlace?.heroImageUrl,
        },
        imageFile,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleAddressChange(nextAddress: string) {
    setAddress(nextAddress);
    setGeocode(null);
  }

  function toggleTag(tagId: string) {
    setTagIds((current) =>
      current.includes(tagId) ? current.filter((item) => item !== tagId) : [...current, tagId]
    );
  }

  return {
    name,
    setName,
    address,
    handleAddressChange,
    categoryId,
    setCategoryId,
    tagIds,
    geocode,
    setImageFile,
    isSearching,
    isSaving,
    message,
    duplicates,
    handleSearchAddress,
    handleSubmit,
    toggleTag,
  };
}

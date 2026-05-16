"use client";

import { Camera, Check, LocateFixed, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  PLACE_CATEGORIES,
  PLACE_TAGS,
  type CategoryId,
  type Place,
  type PlaceDraft,
  findDuplicatePlaces,
} from "@/lib/domain";

type GeocodeResult = {
  address: string;
  latitude: number;
  longitude: number;
  source: "naver" | "fallback";
};

type PlaceFormProps = {
  ownerAnonymousId: string;
  places: Place[];
  editingPlace?: Place | null;
  onCancel: () => void;
  onSave: (input: { id?: string; draft: PlaceDraft; imageFile?: File | null }) => Promise<void>;
};

export function PlaceForm({
  ownerAnonymousId,
  places,
  editingPlace,
  onCancel,
  onSave,
}: PlaceFormProps) {
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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

  function toggleTag(tagId: string) {
    setTagIds((current) =>
      current.includes(tagId) ? current.filter((item) => item !== tagId) : [...current, tagId]
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-[#17352b]">
            {editingPlace ? "맛집 수정" : "맛집 등록"}
          </h2>
          <p className="mt-1 text-sm text-[#5f6f68]">
            가게명과 주소를 확인하고 지도 핀을 저장합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="grid h-10 w-10 place-items-center rounded-md border border-[#d9e4dd] bg-white text-[#17352b] transition hover:border-[#17352b]"
          aria-label="닫기"
        >
          <X size={18} />
        </button>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#17352b]">가게명</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-12 w-full rounded-md border border-[#d9e4dd] bg-white px-3 text-[#17352b] outline-none transition focus:border-[#0f7a5f]"
          placeholder="예: 성수 손칼국수"
          required
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#17352b]">주소</span>
        <div className="flex gap-2">
          <input
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setGeocode(null);
            }}
            className="h-12 min-w-0 flex-1 rounded-md border border-[#d9e4dd] bg-white px-3 text-[#17352b] outline-none transition focus:border-[#0f7a5f]"
            placeholder="도로명 주소"
            required
          />
          <button
            type="button"
            onClick={handleSearchAddress}
            disabled={isSearching || !address.trim()}
            className="grid h-12 w-12 place-items-center rounded-md bg-[#17352b] text-white transition hover:bg-[#0f7a5f] disabled:cursor-not-allowed disabled:bg-[#a9b9b1]"
            aria-label="주소 검색"
          >
            {isSearching ? <LocateFixed size={18} /> : <Search size={18} />}
          </button>
        </div>
      </label>

      {geocode ? (
        <div className="flex items-center gap-2 rounded-md border border-[#bcd9ca] bg-[#eef8f2] px-3 py-2 text-sm font-semibold text-[#0f7a5f]">
          <Check size={16} />
          {geocode.address} · {geocode.latitude.toFixed(4)}, {geocode.longitude.toFixed(4)}
        </div>
      ) : null}

      {duplicates.length ? (
        <div className="rounded-md border border-[#f3c57a] bg-[#fff8e7] p-3 text-sm text-[#765018]">
          <strong className="block text-[#5b3d10]">중복 후보</strong>
          <div className="mt-2 space-y-1">
            {duplicates.map((place) => (
              <p key={place.id}>
                {place.name} · {place.address}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <span className="mb-2 block text-sm font-bold text-[#17352b]">대표 카테고리</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PLACE_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryId(category.id)}
              className={`h-11 rounded-md border px-3 text-sm font-bold transition ${
                categoryId === category.id
                  ? "border-[#17352b] bg-[#17352b] text-white"
                  : "border-[#d9e4dd] bg-white text-[#17352b] hover:border-[#0f7a5f]"
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-2 block text-sm font-bold text-[#17352b]">태그</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLACE_TAGS.map((tag) => (
            <label
              key={tag.id}
              className="flex h-10 items-center gap-2 rounded-md border border-[#d9e4dd] bg-white px-3 text-sm font-semibold text-[#17352b]"
            >
              <input
                type="checkbox"
                checked={tagIds.includes(tag.id)}
                onChange={() => toggleTag(tag.id)}
                className="h-4 w-4 accent-[#0f7a5f]"
              />
              {tag.label}
            </label>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-2 flex items-center gap-2 text-sm font-bold text-[#17352b]">
          <Camera size={16} />
          대표 사진
        </span>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
          className="w-full rounded-md border border-dashed border-[#b8c9c0] bg-white px-3 py-3 text-sm text-[#5f6f68]"
        />
      </label>

      {message ? (
        <p className="rounded-md bg-[#ffeceb] px-3 py-2 text-sm font-semibold text-[#9b2f25]">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSaving}
        className="h-12 w-full rounded-md bg-[#e85d4f] px-4 font-black text-white transition hover:bg-[#c94539] disabled:cursor-not-allowed disabled:bg-[#d0a7a2]"
      >
        {isSaving ? "저장 중" : editingPlace ? "수정 저장" : "맛집 등록"}
      </button>
    </form>
  );
}

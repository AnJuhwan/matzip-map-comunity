"use client";

import { Camera, MessageSquareText, X } from "lucide-react";
import { PRICE_RANGES, type PriceRange, type RevisitIntent } from "@/entities/community";
import { useReviewForm, type ReviewFormProps } from "../model/use-review-form";

export function ReviewForm({
  placeId,
  profile,
  editingReview,
  onCancelEdit,
  onSave,
}: ReviewFormProps) {
  const form = useReviewForm({ placeId, profile, editingReview, onSave });
  const {
    nickname,
    setNickname,
    priceRange,
    setPriceRange,
    recommendedMenu,
    setRecommendedMenu,
    goodPoint,
    setGoodPoint,
    badPoint,
    setBadPoint,
    revisitIntent,
    setRevisitIntent,
    setImageFile,
    message,
    isSaving,
    handleSubmit,
  } = form;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-black text-[#17352b]">
          <MessageSquareText size={20} />
          {editingReview ? "리뷰 수정" : "리뷰 쓰기"}
        </h3>
        {editingReview && onCancelEdit ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="grid h-9 w-9 place-items-center rounded-md border border-[#d9e4dd] bg-white text-[#17352b]"
            aria-label="리뷰 수정 취소"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[#17352b]">닉네임</span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            className="h-11 w-full rounded-md border border-[#d9e4dd] bg-white px-3 text-[#17352b] outline-none focus:border-[#0f7a5f]"
            maxLength={24}
            required
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[#17352b]">가격대</span>
          <select
            value={priceRange}
            onChange={(event) => setPriceRange(event.target.value as PriceRange)}
            className="h-11 w-full rounded-md border border-[#d9e4dd] bg-white px-3 text-[#17352b] outline-none focus:border-[#0f7a5f]"
          >
            {PRICE_RANGES.map((range) => (
              <option key={range} value={range}>
                {range}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#17352b]">추천 메뉴</span>
        <input
          value={recommendedMenu}
          onChange={(event) => setRecommendedMenu(event.target.value)}
          className="h-11 w-full rounded-md border border-[#d9e4dd] bg-white px-3 text-[#17352b] outline-none focus:border-[#0f7a5f]"
          placeholder="예: 바지락 칼국수"
          maxLength={80}
          required
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[#17352b]">좋았던 점</span>
          <textarea
            value={goodPoint}
            onChange={(event) => setGoodPoint(event.target.value)}
            className="min-h-28 w-full resize-none rounded-md border border-[#d9e4dd] bg-white p-3 text-[#17352b] outline-none focus:border-[#0f7a5f]"
            maxLength={500}
            required
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[#17352b]">아쉬운 점</span>
          <textarea
            value={badPoint}
            onChange={(event) => setBadPoint(event.target.value)}
            className="min-h-28 w-full resize-none rounded-md border border-[#d9e4dd] bg-white p-3 text-[#17352b] outline-none focus:border-[#0f7a5f]"
            maxLength={500}
            required
          />
        </label>
      </div>

      <div>
        <span className="mb-2 block text-sm font-bold text-[#17352b]">재방문 의사</span>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["yes", "다시 감"],
            ["maybe", "고민"],
            ["no", "안 갈래"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRevisitIntent(value as RevisitIntent)}
              className={`h-10 rounded-md border text-sm font-black transition ${
                revisitIntent === value
                  ? "border-[#17352b] bg-[#17352b] text-white"
                  : "border-[#d9e4dd] bg-white text-[#17352b] hover:border-[#0f7a5f]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-2 flex items-center gap-2 text-sm font-bold text-[#17352b]">
          <Camera size={16} />
          리뷰 사진
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
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
        className="h-11 w-full rounded-md bg-[#0f7a5f] px-4 font-black text-white transition hover:bg-[#0b5f4a] disabled:cursor-not-allowed disabled:bg-[#9ab8ad]"
      >
        {isSaving ? "저장 중" : editingReview ? "리뷰 수정" : "리뷰 등록"}
      </button>
    </form>
  );
}

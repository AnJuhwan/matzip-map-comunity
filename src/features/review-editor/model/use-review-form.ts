"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  MAX_REVIEW_PHOTOS,
  type AnonymousProfile,
  type PriceRange,
  type Review,
  type RevisitIntent,
  validateReviewPhotoFiles,
} from "@/entities/community";

export type ReviewFormProps = {
  placeId: string;
  profile: AnonymousProfile;
  editingReview?: Review | null;
  onCancelEdit?: () => void;
  onSave: (input: {
    id?: string;
    review: Omit<Review, "id" | "status" | "createdAt">;
    imageFile?: File | null;
    imageFiles?: File[] | null;
  }) => Promise<void>;
};

type UseReviewFormOptions = Omit<ReviewFormProps, "onCancelEdit">;

export function useReviewForm({ placeId, profile, editingReview, onSave }: UseReviewFormOptions) {
  const [nickname, setNickname] = useState(editingReview?.nickname ?? profile.nickname);
  const [priceRange, setPriceRange] = useState<PriceRange>(
    editingReview?.priceRange ?? "1만원 이하"
  );
  const [recommendedMenu, setRecommendedMenu] = useState(editingReview?.recommendedMenu ?? "");
  const [goodPoint, setGoodPoint] = useState(editingReview?.goodPoint ?? "");
  const [badPoint, setBadPoint] = useState(editingReview?.badPoint ?? "");
  const [revisitIntent, setRevisitIntent] = useState<RevisitIntent>(
    editingReview?.revisitIntent ?? "yes"
  );
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [activeImagePreviewIndex, setActiveImagePreviewIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    };
  }, [imagePreviewUrls]);

  function clearImageFiles() {
    setImageFiles([]);
    setImagePreviewUrls([]);
    setActiveImagePreviewIndex(0);
  }

  function handleImageFilesChange(files: FileList | File[] | null) {
    setMessage("");

    const nextImageFiles = Array.from(files ?? []);

    try {
      validateReviewPhotoFiles(nextImageFiles);
    } catch (error) {
      clearImageFiles();
      setMessage(error instanceof Error ? error.message : "리뷰 사진을 확인해주세요.");
      return;
    }

    setImageFiles(nextImageFiles);
    setImagePreviewUrls(nextImageFiles.map((file) => URL.createObjectURL(file)));
    setActiveImagePreviewIndex(0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!recommendedMenu.trim() || !goodPoint.trim() || !badPoint.trim()) {
      setMessage("추천 메뉴, 좋았던 점, 아쉬운 점을 모두 적어주세요.");
      return;
    }

    setIsSaving(true);

    try {
      await onSave({
        id: editingReview?.id,
        review: {
          placeId,
          nickname,
          priceRange,
          recommendedMenu,
          goodPoint,
          badPoint,
          revisitIntent,
          ownerAnonymousId: profile.id,
          imageUrl: editingReview?.imageUrl,
          imageUrls: editingReview?.imageUrls,
        },
        imageFiles,
      });
      setRecommendedMenu("");
      setGoodPoint("");
      setBadPoint("");
      setRevisitIntent("yes");
      clearImageFiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "리뷰 저장 실패");
    } finally {
      setIsSaving(false);
    }
  }

  return {
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
    imageFiles,
    imagePreviewUrls,
    activeImagePreviewIndex,
    setActiveImagePreviewIndex,
    handleImageFilesChange,
    maxReviewPhotos: MAX_REVIEW_PHOTOS,
    message,
    isSaving,
    handleSubmit,
  };
}

// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useReviewForm } from "./use-review-form";
import type { AnonymousProfile } from "@/entities/community";

const profile: AnonymousProfile = {
  id: "anon-1",
  nickname: "테스터",
  backend: "supabase",
};

describe("useReviewForm", () => {
  it("creates previews for selected review photos and submits all selected files", async () => {
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((file) => `blob:${(file as File).name}`);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onSave = vi.fn(() => Promise.resolve());
    const imageFiles = [
      new File(["first"], "first.jpg", { type: "image/jpeg" }),
      new File(["second"], "second.png", { type: "image/png" }),
    ];

    const { result } = renderHook(() =>
      useReviewForm({
        placeId: "place-1",
        profile,
        onSave,
      })
    );

    act(() => {
      result.current.setRecommendedMenu("칼국수");
      result.current.setGoodPoint("국물이 좋아요");
      result.current.setBadPoint("웨이팅이 있어요");
      result.current.handleImageFilesChange(imageFiles);
    });

    expect(result.current.imagePreviewUrls).toEqual(["blob:first.jpg", "blob:second.png"]);
    expect(result.current.activeImagePreviewIndex).toBe(0);

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault() {
          return undefined;
        },
      } as FormEvent<HTMLFormElement>);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        imageFiles,
      })
    );
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:first.jpg");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:second.png");
  });

  it("rejects more than three selected review photos before submit", () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation((file) => `blob:${(file as File).name}`);
    const onSave = vi.fn(() => Promise.resolve());
    const imageFiles = [
      new File(["one"], "one.jpg", { type: "image/jpeg" }),
      new File(["two"], "two.jpg", { type: "image/jpeg" }),
      new File(["three"], "three.jpg", { type: "image/jpeg" }),
      new File(["four"], "four.jpg", { type: "image/jpeg" }),
    ];

    const { result } = renderHook(() =>
      useReviewForm({
        placeId: "place-1",
        profile,
        onSave,
      })
    );

    act(() => {
      result.current.handleImageFilesChange(imageFiles);
    });

    expect(result.current.message).toBe("리뷰 사진은 최대 3장까지 업로드할 수 있습니다.");
    expect(result.current.imagePreviewUrls).toEqual([]);
  });
});

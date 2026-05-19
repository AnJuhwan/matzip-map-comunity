// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnonymousProfile, Place, Review } from "@/entities/community";
import { PlaceDetail } from "./matzip-community-app";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
});

const profile: AnonymousProfile = {
  id: "viewer-1",
  nickname: "담백한 면발수호자",
  backend: "supabase",
};

const place: Place = {
  id: "place-1",
  name: "성수 손칼국수",
  address: "서울 성동구 성수이로 10",
  latitude: 37.5446,
  longitude: 127.0558,
  categoryId: "local",
  tagIds: ["waiting"],
  ownerAnonymousId: "owner-1",
  status: "public",
  reviewCount: 12,
  averageRevisitScore: 0.82,
};

describe("PlaceDetail", () => {
  it("virtualizes long review lists against the page scroll without an inner scroll viewport", () => {
    render(
      createElement(PlaceDetail, {
        place,
        reviews: makeReviews(12),
        profile,
        onEditPlace: vi.fn(),
        onDeletePlace: vi.fn(),
        onReportPlace: vi.fn(),
        onWriteReview: vi.fn(),
        onEditReview: vi.fn(),
        onDeleteReview: vi.fn(),
        onReportReview: vi.fn(),
      })
    );

    expect(screen.queryByTestId("review-list-viewport")).toBeNull();

    const virtualizer = screen.getByTestId("review-list-window-virtualizer");
    const renderedReviewCount = screen.getAllByTestId("review-card").length;

    expect(virtualizer.className).not.toContain("overflow-y-auto");
    expect(renderedReviewCount).toBeGreaterThan(0);
    expect(renderedReviewCount).toBeLessThan(12);
  });

  it("keeps the place information available as a sticky panel while reviews scroll", () => {
    render(
      createElement(PlaceDetail, {
        place,
        reviews: makeReviews(3),
        profile,
        onEditPlace: vi.fn(),
        onDeletePlace: vi.fn(),
        onReportPlace: vi.fn(),
        onWriteReview: vi.fn(),
        onEditReview: vi.fn(),
        onDeleteReview: vi.fn(),
        onReportReview: vi.fn(),
      })
    );

    const placeInfo = screen.getByTestId("place-detail-info");

    expect(placeInfo.className).toContain("lg:sticky");
    expect(placeInfo.className).toContain("lg:top-4");
  });
});

function makeReviews(count: number): Review[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `review-${index + 1}`,
    placeId: place.id,
    nickname: `리뷰어 ${index + 1}`,
    priceRange: "1만-2만원",
    recommendedMenu: `칼국수 ${index + 1}`,
    goodPoint: "국물이 진하고 면이 좋아요.",
    badPoint: "점심에는 조금 기다려야 해요.",
    revisitIntent: "yes",
    ownerAnonymousId: `review-owner-${index + 1}`,
    status: "public",
    createdAt: "2026-05-19T00:00:00.000Z",
  }));
}

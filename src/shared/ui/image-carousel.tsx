"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";

type ImageCarouselProps = {
  imageUrls: string[];
  label: string;
  className?: string;
  viewportClassName?: string;
};

export function ImageCarousel({
  imageUrls,
  label,
  className = "",
  viewportClassName = "h-40",
}: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const totalCount = imageUrls.length;
  const safeActiveIndex = Math.min(activeIndex, Math.max(totalCount - 1, 0));
  const activeImageUrl = imageUrls[safeActiveIndex];

  useEffect(() => {
    if (activeIndex >= totalCount) {
      setActiveIndex(Math.max(totalCount - 1, 0));
    }
  }, [activeIndex, totalCount]);

  if (!totalCount || !activeImageUrl) {
    return null;
  }

  function showPrevious() {
    setActiveIndex((current) => (current + totalCount - 1) % totalCount);
  }

  function showNext() {
    setActiveIndex((current) => (current + 1) % totalCount);
  }

  function showPreviousExpanded() {
    setExpandedIndex((current) => {
      if (current === null) {
        return current;
      }

      return (current + totalCount - 1) % totalCount;
    });
  }

  function showNextExpanded() {
    setExpandedIndex((current) => {
      if (current === null) {
        return current;
      }

      return (current + 1) % totalCount;
    });
  }

  return (
    <>
      <div className={`relative overflow-hidden rounded-md bg-[#eef5f0] ${className}`}>
        <button
          type="button"
          onClick={() => setExpandedIndex(safeActiveIndex)}
          className={`block w-full bg-cover bg-center ${viewportClassName}`}
          style={imageBackground(activeImageUrl)}
          aria-label={`${label} ${safeActiveIndex + 1}/${totalCount} 크게 보기`}
        />
        <CarouselCounter currentIndex={safeActiveIndex} totalCount={totalCount} />
        {totalCount > 1 ? (
          <>
            <CarouselButton
              direction="previous"
              label={`${label} 이전 이미지`}
              onClick={showPrevious}
            />
            <CarouselButton direction="next" label={`${label} 다음 이미지`} onClick={showNext} />
          </>
        ) : null}
        <button
          type="button"
          onClick={() => setExpandedIndex(safeActiveIndex)}
          className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-md bg-black/55 text-white transition hover:bg-black/70"
          aria-label={`${label} 크게 보기`}
        >
          <Expand size={15} />
        </button>
      </div>

      {expandedIndex !== null ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${label} 크게 보기`}
        >
          <button
            type="button"
            onClick={() => setExpandedIndex(null)}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-md bg-white text-[#17352b] shadow-lg"
            aria-label="이미지 크게 보기 닫기"
          >
            <X size={18} />
          </button>
          <div className="relative h-[82vh] w-full max-w-5xl">
            <div
              className="h-full w-full rounded-md bg-contain bg-center bg-no-repeat"
              style={imageBackground(imageUrls[expandedIndex])}
              aria-label={`${label} ${expandedIndex + 1}/${totalCount}`}
            />
            <CarouselCounter currentIndex={expandedIndex} totalCount={totalCount} />
            {totalCount > 1 ? (
              <>
                <CarouselButton
                  direction="previous"
                  label={`${label} 이전 큰 이미지`}
                  onClick={showPreviousExpanded}
                />
                <CarouselButton
                  direction="next"
                  label={`${label} 다음 큰 이미지`}
                  onClick={showNextExpanded}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function CarouselCounter({
  currentIndex,
  totalCount,
}: {
  currentIndex: number;
  totalCount: number;
}) {
  return (
    <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-xs font-black text-white">
      {currentIndex + 1}/{totalCount}
    </span>
  );
}

function CarouselButton({
  direction,
  label,
  onClick,
}: {
  direction: "previous" | "next";
  label: string;
  onClick: () => void;
}) {
  const isPrevious = direction === "previous";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md bg-white/90 text-[#17352b] shadow-sm transition hover:bg-white ${
        isPrevious ? "left-2" : "right-2"
      }`}
      aria-label={label}
    >
      {isPrevious ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
    </button>
  );
}

function imageBackground(url: string) {
  return {
    backgroundImage: `url(${JSON.stringify(url)})`,
  };
}

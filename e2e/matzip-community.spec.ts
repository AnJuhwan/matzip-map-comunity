import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const e2eBackend = process.env.E2E_BACKEND ?? "local";
const seongsuLocation = { latitude: 37.5446, longitude: 127.0558 };
const kkachisanLocation = { latitude: 37.531768, longitude: 126.846683 };
const cityHallLocation = { latitude: 37.5665, longitude: 126.978 };
const yeongdeungpoStationLocation = { latitude: 37.515577, longitude: 126.907702 };
const seongsuCandidate = {
  tempId: "candidate-seongsu-taco",
  name: "성수 타코랩",
  address: "서울 성동구 성수이로 20",
  latitude: 37.5447,
  longitude: 127.0559,
  categoryId: "date",
  tagIds: ["takeout"],
  distanceMeters: 14,
  sourceQuery: "성수동 맛집",
  source: "naver",
};

test("loads current-location places from the visible map bounds", async ({ page, context }) => {
  test.skip(e2eBackend === "supabase", "Local fallback seed test is skipped in DB mode.");
  await useBrowserLocation(context, seongsuLocation);
  await mockNearbyCandidates(page, []);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "맛잘알 동네지도" })).toBeVisible();
  await expect(page.getByRole("button", { name: "내 위치로 이동" })).toBeVisible();
  await expect(
    page.getByText("Supabase 설정이 준비되지 않아 브라우저 저장소로 동작합니다.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /성수 손칼국수 가성비/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /성수 타코랩 네이버 음식점/ })).toBeHidden();
  await expect(page.getByRole("button", { name: /부산 돼지국밥 로컬추천/ })).toBeHidden();
  await expect(page.getByRole("button", { name: /제주 바다카페 카페/ })).toBeHidden();
  await expect(page.getByRole("img", { name: "성수 손칼국수 사진" }).first()).toBeVisible();
});

test("creates a local place and review through the saved detail page", async ({
  page,
  context,
}) => {
  test.skip(e2eBackend === "supabase", "Local mutation test is skipped in DB mode.");
  await useBrowserLocation(context, cityHallLocation);
  await mockNearbyCandidates(page, []);

  await page.goto("/");
  await page.getByRole("button", { name: "등록", exact: true }).click();

  await page.getByLabel("가게명").fill("테스트 분식");
  await page.getByPlaceholder("도로명 주소").fill("서울특별시");
  await page.getByRole("button", { name: "주소 검색" }).click();

  await expect(page.getByText(/서울특별시/)).toBeVisible();

  await page.getByLabel("주차").check();
  await page.getByRole("button", { name: "맛집 등록" }).click();

  await expect(page).toHaveURL(/\/places\/.+/);
  await expect(page.locator("h1").filter({ hasText: "테스트 분식" })).toBeVisible();
  await expect(page.getByText("아직 리뷰가 없습니다.")).toBeVisible();

  await page.getByLabel("추천 메뉴").fill("김치볶음밥");
  await page.getByLabel("좋았던 점").fill("매장이 깔끔하고 음식이 빨리 나왔습니다.");
  await page.getByLabel("아쉬운 점").fill("점심시간에는 자리가 조금 부족했습니다.");
  await page.getByRole("button", { name: "다시 감" }).click();
  await page.getByRole("button", { name: "리뷰 등록" }).click();

  await expect(page.getByText("김치볶음밥")).toBeVisible();
  await expect(page.getByText("매장이 깔끔하고 음식이 빨리 나왔습니다.")).toBeVisible();
  await expect(page.getByText("점심시간에는 자리가 조금 부족했습니다.")).toBeVisible();
});

test("searches Naver candidates with an entered area name", async ({ page, context }) => {
  test.skip(e2eBackend === "supabase", "Local candidate search test is skipped in DB mode.");
  await useBrowserLocation(context, kkachisanLocation);
  await page.route("**/api/nearby-place-candidates**", async (route) => {
    const url = new URL(route.request().url());
    const searchQuery = url.searchParams.get("query");
    const places =
      searchQuery === "까치산역"
        ? [
            {
              tempId: "candidate-kkachisan-gwangseon",
              name: "광선집",
              address: "서울 강서구 강서로 10",
              latitude: 37.531768,
              longitude: 126.846683,
              categoryId: "local",
              tagIds: ["local"],
              distanceMeters: 0,
              sourceQuery: "까치산역 맛집",
              source: "naver",
            },
          ]
        : [];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "naver-local-search",
        queryArea: null,
        count: places.length,
        places,
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("button", { name: /광선집 네이버 음식점/ })).toBeHidden();

  await page.getByPlaceholder("역, 동네, 음식점 검색").fill("까치산역");
  await page.getByRole("button", { name: "검색하기" }).click();

  await expect(page.getByRole("button", { name: /광선집 네이버 음식점/ })).toBeVisible();
});

test("moves the search location to an entered station before loading Naver candidates", async ({
  page,
  context,
}) => {
  test.skip(e2eBackend === "supabase", "Local station search test is skipped in DB mode.");
  await useBrowserLocation(context, seongsuLocation);
  const candidateRequests: URL[] = [];

  await page.route("**/api/geocode?**", async (route) => {
    const url = new URL(route.request().url());

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        address: url.searchParams.get("query") === "영등포역" ? "서울 영등포구 경인로 846" : "",
        latitude: yeongdeungpoStationLocation.latitude,
        longitude: yeongdeungpoStationLocation.longitude,
        source: "naver-local-search",
      }),
    });
  });

  await page.route("**/api/nearby-place-candidates**", async (route) => {
    const url = new URL(route.request().url());
    candidateRequests.push(url);
    const latitude = Number(url.searchParams.get("latitude"));
    const longitude = Number(url.searchParams.get("longitude"));
    const isYeongdeungpoSearch =
      url.searchParams.get("query") === "영등포역" &&
      Math.abs(latitude - yeongdeungpoStationLocation.latitude) < 0.000001 &&
      Math.abs(longitude - yeongdeungpoStationLocation.longitude) < 0.000001;
    const places = isYeongdeungpoSearch
      ? [
          {
            tempId: "candidate-yeongdeungpo-gukbap",
            name: "영등포 국밥",
            address: "서울 영등포구 경인로 840",
            latitude: 37.5157,
            longitude: 126.9079,
            categoryId: "local",
            tagIds: ["local"],
            distanceMeters: 22,
            sourceQuery: "영등포역 맛집",
            source: "naver",
          },
        ]
      : [];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "naver-local-search",
        queryArea: null,
        count: places.length,
        places,
      }),
    });
  });

  await page.goto("/");

  await page.getByPlaceholder("역, 동네, 음식점 검색").fill("영등포역");
  await page.getByRole("button", { name: "검색하기" }).click();

  await expect(page.getByRole("button", { name: /영등포 국밥 네이버 음식점/ })).toBeVisible();
  expect(
    candidateRequests.some(
      (url) =>
        url.searchParams.get("query") === "영등포역" &&
        Number(url.searchParams.get("latitude")) === yeongdeungpoStationLocation.latitude &&
        Number(url.searchParams.get("longitude")) === yeongdeungpoStationLocation.longitude
    )
  ).toBe(true);
});

test("saves a Naver candidate only when the first review is submitted", async ({
  page,
  context,
}) => {
  test.skip(e2eBackend === "supabase", "Local candidate mutation test is skipped in DB mode.");
  await useBrowserLocation(context, seongsuLocation);
  await mockNearbyCandidates(page, [seongsuCandidate]);

  await page.goto("/");
  await page.getByPlaceholder("역, 동네, 음식점 검색").fill("성수동");
  await page.getByRole("button", { name: "검색하기" }).click();
  await page.getByRole("button", { name: /성수 타코랩 네이버 음식점/ }).click();

  await expect(page).toHaveURL(/\/places\/new\?/);
  await expect(page.locator("h1").filter({ hasText: "성수 타코랩" })).toBeVisible();
  await expect(page.getByText("아직 리뷰가 없습니다.")).toBeVisible();

  await page.getByLabel("추천 메뉴").fill("비프 타코");
  await page.getByLabel("좋았던 점").fill("후보를 누르고 첫 리뷰를 남기면 맛집도 같이 저장됩니다.");
  await page.getByLabel("아쉬운 점").fill("좌석이 많지는 않았습니다.");
  await page.getByRole("button", { name: "리뷰 등록" }).click();

  await expect(page).toHaveURL(/\/places\/.+/);
  await expect(page.locator("h1").filter({ hasText: "성수 타코랩" })).toBeVisible();
  await expect(page.getByText("비프 타코")).toBeVisible();
  await expect(
    page.getByText("후보를 누르고 첫 리뷰를 남기면 맛집도 같이 저장됩니다.")
  ).toBeVisible();
});

test("loads public places from the Supabase database", async ({ page }) => {
  test.skip(e2eBackend !== "supabase", "Supabase DB smoke test only runs in DB mode.");

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "맛잘알 동네지도" })).toBeVisible();
  await expect(page.getByText("Supabase", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Supabase 설정이 준비되지 않아 브라우저 저장소로 동작합니다.")
  ).toBeHidden();

  const listSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "맛집 목록" }) });
  const countText = await listSection.getByText(/^\d+곳$/).textContent();
  const placeCount = Number(countText?.replace("곳", "") ?? 0);

  expect(placeCount).toBeGreaterThan(0);
  await expect(listSection.getByRole("button").first()).toBeVisible();
});

async function useBrowserLocation(
  context: BrowserContext,
  location: { latitude: number; longitude: number }
) {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(location);
  await context.addInitScript((mockLocation) => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        clearWatch() {
          return undefined;
        },
        getCurrentPosition(success: PositionCallback) {
          success({
            coords: {
              latitude: mockLocation.latitude,
              longitude: mockLocation.longitude,
              accuracy: 10,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
        watchPosition(success: PositionCallback) {
          success({
            coords: {
              latitude: mockLocation.latitude,
              longitude: mockLocation.longitude,
              accuracy: 10,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);

          return 1;
        },
      },
    });
  }, location);
}

async function mockNearbyCandidates(page: Page, places: unknown[]) {
  await page.route("**/api/nearby-place-candidates**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "naver-local-search",
        queryArea: "성수동",
        count: places.length,
        places,
      }),
    });
  });
}

import { expect, test, type BrowserContext } from "@playwright/test";

const e2eBackend = process.env.E2E_BACKEND ?? "supabase";
const kkachisanLocation = { latitude: 37.531768, longitude: 126.846683 };
const seongsuLocation = { latitude: 37.5446, longitude: 127.0558 };
const yeongdeungpoStationLocation = { latitude: 37.515577, longitude: 126.907702 };

test("searches Naver candidates with an entered area name", async ({ page, context }) => {
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
              latitude: kkachisanLocation.latitude,
              longitude: kkachisanLocation.longitude,
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

test("loads public places from the Supabase database", async ({ page }) => {
  test.skip(e2eBackend !== "supabase", "Supabase DB smoke test only runs in DB mode.");

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "맛잘알 동네지도" })).toBeVisible();
  await expect(page.getByText("Supabase", { exact: true })).toBeVisible();

  const listSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "현재 지도 음식점" }) });
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

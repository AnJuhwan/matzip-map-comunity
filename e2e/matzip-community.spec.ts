import { expect, test } from "@playwright/test";

const e2eBackend = process.env.E2E_BACKEND ?? "local";

test("loads the fallback map, seeded places, and search filtering", async ({ page }) => {
  test.skip(e2eBackend === "supabase", "Local fallback seed test is skipped in DB mode.");

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "맛잘알 동네지도" })).toBeVisible();
  await expect(
    page.getByText("Supabase 설정이 준비되지 않아 브라우저 저장소로 동작합니다.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /성수 손칼국수 가성비/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /부산 돼지국밥 로컬추천/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /제주 바다카페 카페/ })).toBeVisible();

  await page.getByPlaceholder("가게명, 주소, 태그 검색").fill("제주");

  await expect(page.getByText("1곳")).toBeVisible();
  await expect(page.getByRole("button", { name: /제주 바다카페 카페/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /성수 손칼국수 가성비/ })).toBeHidden();
});

test("creates a local place and review through the browser UI", async ({ page }) => {
  test.skip(e2eBackend === "supabase", "Local mutation test is skipped in DB mode.");

  await page.goto("/");
  await page.getByRole("button", { name: "등록", exact: true }).click();

  await page.getByLabel("가게명").fill("테스트 분식");
  await page.getByPlaceholder("도로명 주소").fill("서울 중구 테스트로 12");
  await page.getByRole("button", { name: "주소 검색" }).click();

  await expect(page.getByText(/서울 중구 테스트로 12/)).toBeVisible();

  await page.getByLabel("주차").check();
  await page.getByRole("button", { name: "맛집 등록" }).click();

  await expect(page.getByRole("button", { name: /테스트 분식 가성비/ })).toBeVisible();
  await expect(page.locator("h2").filter({ hasText: "테스트 분식" })).toBeVisible();
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

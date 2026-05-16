# 코드 컨벤션

이 문서는 새 규칙을 많이 추가하기보다, 현재 레포가 이미 사용하는 스타일을 명확히 정리한다. 자동화는 기존 ESLint, Prettier, TypeScript, commitlint 설정을 기준으로 한다.

## 포맷팅

- Prettier 설정을 기준으로 정렬한다.
- 줄 길이는 100자를 기준으로 하고, 필요하면 의미 단위로 줄을 나눈다.
- 세미콜론을 사용하고, 문자열은 double quote를 사용한다.
- trailing comma는 `es5` 기준을 따른다.

```ts
const priceRanges = ["1만원 이하", "1만-2만원", "2만-3만원"] as const;
```

## TypeScript

- `strict` 모드를 기준으로 작성한다.
- 공개 함수의 인자와 반환 데이터는 명시적인 타입을 선호한다.
- 도메인에서 공유하는 타입과 상수는 `src/entities/<entity-name>/model/domain.ts`처럼 한 곳에 모은다.
- 문자열 literal union이나 `as const` 배열을 우선 사용하고, 의미가 불분명한 `string` 확장은 피한다.

```ts
export type ContentStatus = "public" | "hidden" | "deleted";

export function getVisiblePlaces<T extends { status: ContentStatus }>(places: T[]) {
  return places.filter((place) => place.status === "public");
}
```

## React와 Next.js

- App Router 구조를 따른다.
- 클라이언트 상태, 브라우저 API, 이벤트 핸들러가 필요한 컴포넌트에만 `"use client"`를 둔다.
- 서버 API는 `src/app/api/*/route.ts`에 둔다.
- 페이지 진입점은 `src/app`에서 얇게 유지하고, 실제 화면 조합은 `src/widgets`에 둔다.
- 사용자 행동 단위의 UI와 폼 로직은 `src/features/<feature-name>`에 둔다.
- 공유 도메인 타입, 상수, 저장소 로직은 `src/entities/<entity-name>`에 둔다.
- 각 레이어는 `index.ts` 공개 진입점을 두고, 다른 레이어에서는 공개 진입점을 우선 import한다.
- 컴포넌트 안에서는 파생 상태를 `useMemo`, 이벤트 핸들러를 일반 함수나 `useCallback`으로 정리하되, 불필요한 memoization은 추가하지 않는다.
- 컴포넌트가 길어지면 상태와 제출 로직을 `model/use-*.ts` 훅으로 분리하고, `ui/*.tsx`는 렌더링에 집중한다.

## FSD 구조

- `src/app`: Next.js 라우트, 레이아웃, API route만 둔다.
- `src/widgets`: 페이지를 구성하는 큰 화면 블록을 둔다. 예: `matzip-community`
- `src/features`: 사용자가 수행하는 기능 단위를 둔다. 예: `place-map`, `place-editor`, `review-editor`
- `src/entities`: 도메인 타입, 상수, 저장소 로직을 둔다. 예: `community`
- `src/shared`: 특정 도메인이나 기능에 묶이지 않는 공용 코드를 둔다.
- 의존성은 `app -> widgets -> features -> entities -> shared` 방향으로만 흐르게 한다.
- 각 slice는 `index.ts`를 public API로 사용한다.
- Next App Router와 충돌하지 않도록 별도의 `src/pages` 레이어는 만들지 않는다.

## 이름과 파일 구조

- 파일명은 kebab-case를 사용한다. 예: `place-form.tsx`, `community-store.test.ts`
- React 컴포넌트는 PascalCase를 사용한다. 예: `PlaceForm`
- 함수와 변수는 camelCase를 사용한다. 예: `saveReview`, `selectedPlaceId`
- 공유 상수 배열은 SCREAMING_SNAKE_CASE를 사용한다. 예: `PLACE_CATEGORIES`
- 테스트 파일은 대상 파일 옆에 `*.test.ts` 또는 `*.test.tsx`로 둔다.

## 테스트

- 도메인 로직, 저장소 로직, API route는 Vitest로 검증한다.
- 사용자가 실제로 거치는 주요 흐름은 Playwright e2e로 검증한다.
- UI 변경이 있으면 가능하면 `npm run test:e2e`까지 확인한다.
- 문서만 바꾸는 변경은 `npm run format:check` 확인으로 충분하다.

## Git

- 커밋 메시지와 브랜치 이름은 [Git 컨벤션](git-conventions.md)을 따른다.
- 커밋 메시지는 Conventional Commits 형식을 사용한다.
- 작업 브랜치는 `<type>/<kebab-summary>` 또는 `<type>/<issue-number>-<kebab-summary>` 형식을 사용한다.

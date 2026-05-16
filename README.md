# 맛잘알 동네지도

Next.js 15 App Router와 Supabase로 만든 지도 중심 맛집 커뮤니티 MVP입니다. 사용자는 로그인 화면 없이 익명 세션으로 맛집과 리뷰를 등록하고, 같은 기기에서 본인이 쓴 내용을 수정하거나 삭제할 수 있습니다.

## 배포

- Production: [https://matzip-map-community.vercel.app](https://matzip-map-community.vercel.app)
- Hosting: Vercel
- 데이터: Supabase production 환경변수 기반
- 지도: Naver Developers 콘솔에 production 도메인을 허용 등록하기 전까지 fallback 지도를 사용

## 주요 기능

- 네이버지도 중심 맛집 탐색
- 가게명/주소 검색 후 좌표 확인
- 중복 맛집 후보 표시
- 고정 카테고리와 선택 태그
- 가격대, 추천 메뉴, 좋았던 점, 아쉬운 점, 재방문 의사 기반 리뷰
- 선택 사진 업로드
- 신고 접수와 공개/숨김/삭제 상태
- Supabase 환경변수 미설정 시 로컬 저장소 fallback

## 시작하기

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

## 폴더 구조

이 프로젝트는 Feature-Sliced Design(FSD)을 기준으로 폴더를 나눕니다. Next.js App Router의 예약 폴더인 `src/app`은 라우팅과 route handler만 담당하고, 실제 화면과 비즈니스 로직은 FSD 레이어에 둡니다.

```text
src/
  app/                         # Next.js 라우트, 레이아웃, API route
  widgets/                     # 페이지를 구성하는 큰 화면 블록
    matzip-community/
      ui/                      # 화면 렌더링
      model/                   # 화면 상태와 이벤트 로직
  features/                    # 사용자가 수행하는 기능 단위
    place-map/
      ui/
      model/
    place-editor/
      ui/
      model/
    review-editor/
      ui/
      model/
    naver-place-import/
      model/
  entities/                    # 도메인 모델과 저장소
    community/
      model/
  shared/                      # 특정 도메인에 묶이지 않는 공용 코드
```

레이어 의존성은 `app -> widgets -> features -> entities -> shared` 방향으로만 흐르게 유지합니다. 각 slice는 `index.ts`를 public API로 사용하고, UI와 로직은 `ui`와 `model` 폴더로 분리합니다.

## Compound Engineering 루프

Codex에서 `compound-engineering` 플러그인을 활성화한 뒤 큰 작업은 다음 루프로 진행합니다.

```text
/ce-plan
/ce-work
/ce-code-review
/ce-compound mode:headless
```

브라우저에서 검증해야 하는 UI 변경은 Playwright e2e 테스트까지 통과시킵니다.

처음 실행하는 환경에서는 Chromium 브라우저를 한 번 설치합니다.

```bash
npm run test:e2e:install
```

기본 e2e는 재현 가능한 로컬 fallback 데이터로 실행합니다. 실제 Supabase DB에서 공개 맛집을 가져오는 smoke test는 `.env`의 DB 설정을 사용해 별도로 실행합니다.

```bash
npm run test:e2e
npm run test:e2e:db
npm run test:e2e:db:ui
```

이미 3107 포트를 쓰는 개발 서버가 있으면 `E2E_PORT=3108 npm run test:e2e`처럼 포트를 바꿔 실행합니다.

## 환경변수

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=
NAVER_MAP_CLIENT_ID=
NAVER_MAP_CLIENT_SECRET=
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
```

`NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`가 없으면 실제 네이버지도 대신 fallback 지도가 표시됩니다. `NAVER_MAP_CLIENT_ID`와 `NAVER_MAP_CLIENT_SECRET`가 없으면 주소 검색은 개발용 fallback 좌표를 반환합니다.
네이버 지역 검색으로 맛집을 가져오려면 네이버 Developers 검색 API용 `NAVER_SEARCH_CLIENT_ID`와 `NAVER_SEARCH_CLIENT_SECRET`을 추가로 설정해야 합니다.

Vercel production에는 화면 렌더링에 필요한 공개 환경변수인 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 설정합니다. 네이버지도를 production에서 사용하려면 Naver Developers 콘솔에 `https://matzip-map-community.vercel.app` 도메인을 허용 등록한 뒤 `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`를 Vercel production 환경변수로 추가합니다. 주소 검색과 네이버 지역 검색/import 기능까지 production에서 사용하려면 서버 전용 `NAVER_MAP_CLIENT_SECRET`, `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET`, `NAVER_IMPORT_ADMIN_TOKEN`도 Vercel 환경변수로 추가합니다.

## Supabase

Supabase SQL Editor에서 `supabase/schema.sql`을 실행한 뒤 Anonymous Sign-Ins를 활성화하세요. 사진 업로드는 `place-photos` Storage bucket을 사용합니다.

## 문서

- [제품 결정](docs/project-decisions.md)
- [GStack 관점 리뷰](docs/mvp-gstack-review.md)
- [운영 및 배포 체크리스트](docs/operations.md)
- [Pre-Landing Review](docs/pre-landing-review.md)
- [코드 컨벤션](docs/code-conventions.md)
- [Git 컨벤션](docs/git-conventions.md)
- [PR 컨벤션](docs/pr-conventions.md)

## 확인

```bash
npm test
npm run test:e2e
npm run test:e2e:db
npm run lint
npm run typecheck
npm run build
```

# 맛잘알 동네지도

Next.js 15 App Router와 Supabase로 만든 지도 중심 맛집 커뮤니티 MVP입니다. 사용자는 로그인 화면 없이 익명 세션으로 맛집과 리뷰를 등록하고, 같은 기기에서 본인이 쓴 내용을 수정하거나 삭제할 수 있습니다.

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

## Supabase

Supabase SQL Editor에서 `supabase/schema.sql`을 실행한 뒤 Anonymous Sign-Ins를 활성화하세요. 사진 업로드는 `place-photos` Storage bucket을 사용합니다.

## 문서

- [제품 결정](docs/project-decisions.md)
- [GStack 관점 리뷰](docs/mvp-gstack-review.md)
- [운영 및 배포 체크리스트](docs/operations.md)
- [Pre-Landing Review](docs/pre-landing-review.md)
- [Git 컨벤션](docs/git-conventions.md)

## 확인

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

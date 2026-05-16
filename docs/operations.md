# 운영 및 배포 체크리스트

작성일: 2026-05-16

## 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`을 연다.

## 환경변수

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=
NAVER_MAP_CLIENT_ID=
NAVER_MAP_CLIENT_SECRET=
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
NAVER_IMPORT_ADMIN_TOKEN=
```

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: 브라우저에서 쓰는 publishable key
- `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`: 네이버지도 JavaScript API client id
- `NAVER_MAP_CLIENT_ID`: 서버 지오코딩 요청용 client id
- `NAVER_MAP_CLIENT_SECRET`: 서버 지오코딩 요청용 secret
- `NAVER_SEARCH_CLIENT_ID`: 네이버 지역 검색 후보 조회용 client id
- `NAVER_SEARCH_CLIENT_SECRET`: 네이버 지역 검색 후보 조회용 secret
- `NAVER_IMPORT_ADMIN_TOKEN`: 운영자 후보 조회 API 호출 시 `x-matzip-admin-token` 헤더로 보낼 서버 전용 토큰

## Supabase 설정

1. Supabase Dashboard에서 Authentication, Sign In / Providers로 이동한다.
2. Anonymous provider의 `Allow anonymous sign-ins`를 켠다.
3. SQL Editor에서 `supabase/schema.sql`을 실행한다.
4. Schema Visualizer에서 `anonymous_profiles`, `places`, `reviews`, `reports`를 확인한다.
5. Storage에 `place-photos` bucket이 생성됐는지 확인한다.

## RLS 의도

- `places`, `reviews`: `status = 'public'`인 행만 공개 읽기
- `places`, `reviews`: 공개 상태인 본인 콘텐츠만 수정 또는 삭제 상태로 전환
- `reviews`: 연결된 `places` 행이 공개 상태일 때만 공개 읽기 및 신규 작성
- `anonymous_profiles`: 본인 프로필만 조회 및 수정
- `reports`: 인증된 익명 사용자만 신고 생성
- `storage.objects`: `place-photos/{auth.uid()}/...` 경로에 JPG, PNG, WebP, GIF만 업로드 허용
- `place-photos` bucket: public 읽기, 5MB 파일 크기 제한, 이미지 MIME type 제한

## 네이버지도 설정

- 지도 렌더링에는 `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`가 필요하다.
- 주소 검색에는 `NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET`가 필요하다.
- 네이버 플레이스 데이터를 복제하지 않고, 사용자가 입력한 가게명과 주소를 저장한다.
- `/api/naver-places`는 운영자 검토용 후보 조회 API다. `NAVER_IMPORT_ADMIN_TOKEN`과 일치하는 `x-matzip-admin-token` 헤더가 있어야 호출할 수 있고, 후보를 자동 공개 데이터로 저장하지 않는다.

### 주소 검색 401 확인

`/api/geocode`가 401을 반환하면 앱 코드보다 Naver Cloud 설정을 먼저 확인한다.

- Maps Geocoding API가 프로젝트에 활성화되어 있는지 확인한다.
- `NAVER_MAP_CLIENT_ID`와 `NAVER_MAP_CLIENT_SECRET`가 JavaScript 지도 키가 아니라 Geocoding API 호출용 값인지 확인한다.
- 서버 호출 도메인, IP, 서비스 제한 조건이 로컬 개발 환경을 막고 있지 않은지 확인한다.
- 브라우저 지도 표시용 `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`와 서버 지오코딩용 secret을 같은 공개 변수로 합치지 않는다.

## 검증 명령

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

브라우저에서 확인할 항목:

- 첫 진입 시 익명 닉네임과 Supabase 배지가 보이는지
- 주소 검색 후 좌표가 표시되는지
- 맛집 등록 후 지도와 목록에 반영되는지
- 같은 브라우저에서 수정/삭제 버튼이 보이는지
- 신고 버튼 클릭 시 신고 접수 메시지가 보이는지

## PR 리뷰 기준

- 새 UI는 지도 중심 첫 화면을 깨지 않아야 한다.
- 운영 데이터가 사라질 수 있는 fallback 변경은 명확히 표시해야 한다.
- Supabase RLS 변경은 공개 읽기와 작성자 제한을 같이 검토해야 한다.
- 리뷰 투명성 필드는 협찬 여부 없이 가격대, 추천 메뉴, 장점, 아쉬운 점, 재방문 의사를 유지한다.

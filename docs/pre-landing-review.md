# Pre-Landing Review

작성일: 2026-05-16

## 리뷰 범위

이 리뷰는 `feat/matzip-map-mvp` 브랜치의 MVP 구현과 문서 변경을 대상으로 한다.

주요 변경:

- Next.js 15 App Router 맛집 지도 커뮤니티 UI
- Supabase Anonymous Sign-In, RLS, Storage schema
- 네이버지도 렌더링, 지오코딩 API, 지역 검색 후보 API
- 익명 닉네임, 맛집 등록, 리뷰, 신고, 수정, 삭제
- 제품 결정, 운영 체크리스트, GStack 관점 리뷰 문서

## 자동 검증

```bash
npm test
# 4 files passed, 17 tests passed

npm run lint
# exit 0

npm run typecheck
# exit 0

npm run format:check
# All matched files use Prettier code style

npm run build
# Next.js 15.5.18 compiled successfully
```

## Smoke Test

새 dev server를 `http://localhost:3010`에서 실행해 확인했다.

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3010
# 200
```

```bash
curl -s 'http://localhost:3010/api/naver-places?limit=1'
# HTTP 200, count 1, 명동교자 본점 좌표 반환 확인
```

```bash
curl -i 'http://localhost:3010/api/geocode?query=%EC%84%9C%EC%9A%B8%EC%8B%9C%EC%B2%AD'
# HTTP/1.1 401 Unauthorized
# 현재 로컬 Naver Cloud 지오코딩 credential 또는 권한 설정 문제
```

## 리뷰 결과

### Blocker

현재 코드 레벨 blocker는 발견하지 못했다. 빌드, 타입 체크, lint, unit test는 통과한다.

### 운영 전 확인 필요

1. Naver Geocoding API credential

현재 로컬 `.env` 기준 `/api/geocode`가 401을 반환한다. 주소 검색은 맛집 등록의 핵심 경로라서 운영 배포 전 Naver Cloud Maps Geocoding API 활성화, key id, secret, 호출 제한 조건을 확인해야 한다. 이 내용은 `docs/operations.md`에 남겼다.

2. 관리자 moderation UI

신고 테이블과 숨김 상태는 준비되어 있지만 관리자 화면은 없다. MVP 공개는 가능하지만, 사용자가 늘기 전 신고 처리 루틴이 필요하다.

3. Production fallback 정책

Supabase 또는 네이버지도 설정이 없을 때 fallback은 개발에 유용하다. 운영에서는 조용한 로컬 저장이 데이터 유실처럼 보일 수 있으므로, production에서는 명확한 설정 오류를 보여주는 쪽이 안전하다.

4. 네이버 지역 검색 후보 API 사용 범위

`/api/naver-places`는 후보 조회만 수행하고 DB에 자동 저장하지 않는다. 네이버 플레이스 데이터를 무단 복제하지 않는다는 원칙을 유지하려면, 운영자가 후보를 검토하고 사용자가 직접 등록한 데이터와 구분해야 한다.
후보 조회는 네이버 Developers Search API의 지역 검색 응답을 기존 후보 모델로 변환한다.

## React/Next.js 관점 체크

- Client Component 경계는 지도, 폼, 커뮤니티 앱처럼 브라우저 상태가 필요한 곳에만 있다.
- API route는 `force-dynamic`으로 외부 API 호출을 정적화하지 않는다.
- Supabase client는 browser client에서만 생성된다.
- 리스트 key는 place/review id를 사용한다.
- 버튼은 native `button`을 사용하고 icon-only 버튼에는 `aria-label`이 있다.

## Supabase/RLS 관점 체크

- 공개 읽기는 `status = 'public'` 조건으로 제한된다.
- 작성, 수정, 삭제는 `auth.uid()`와 `owner_id`가 같은 경우만 가능하다.
- 익명 프로필은 본인만 조회 및 수정한다.
- Storage upload는 `place-photos/{auth.uid()}/...` 경로만 허용한다.

## PR 결론

PR은 올려도 된다. 단, Naver Geocoding 401은 배포 전 환경 설정 이슈로 명확히 남겨야 한다. MVP 다음 단계는 관리자 moderation, production fallback 정책, 빈 상태 UX 개선이다.

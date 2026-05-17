# Postman API 호출 지원 계획

작성일: 2026-05-17

기획 저장소: [코덱스 기획 창고](https://www.notion.so/363f1beebaaf804d808de2d9cf668c95)

Notion 계획 페이지: [Postman API 호출 지원 계획](https://www.notion.so/363f1beebaaf81fa82e5e4b3552e4462)

## 배경과 목표

기존 네이버 후보 API는 GET query string으로 호출할 수 있지만 Postman에서는 raw JSON body로 테스트하는 흐름이 더 편하다. 목표는 기존 GET API와 응답 shape를 유지하면서 Postman에서 바로 가져다 쓸 수 있는 POST 요청과 collection 문서를 제공하는 것이다.

## 범위

- `/api/nearby-place-candidates`에 JSON body 기반 POST wrapper 추가
- `/api/naver-places`에 JSON body 기반 POST wrapper 추가
- Postman collection과 environment 예시 추가
- README와 운영 문서에 호출 방법 연결

## 제외 범위

- 네이버 캡차 우회 또는 토큰 자동 해결
- DB 저장 API 추가
- UI 변경

## 하위 태스크

- nearby 후보 POST API
  - 수정 영역: `src/app/api/nearby-place-candidates/route.ts`
  - 완료 조건: latitude, longitude, bounds, query, areaQuery, categories, includePhotos JSON body를 기존 검색 파라미터로 변환한다.
  - 검증: route POST 테스트

- 관리자 후보 조회 POST API
  - 수정 영역: `src/app/api/naver-places/route.ts`
  - 완료 조건: query, limit JSON body와 `x-matzip-admin-token` 헤더로 기존 관리자 후보 조회 동작을 수행한다.
  - 검증: route POST 테스트

- Postman collection
  - 수정 영역: `docs/postman/*`
  - 완료 조건: Postman import 가능한 collection과 environment 예시를 제공한다.
  - 검증: collection structure 테스트

- 운영 문서
  - 수정 영역: `README.md`, `docs/operations.md`
  - 완료 조건: Postman import와 수동 호출법을 설명한다.
  - 검증: 문서 diff 확인

## 선택한 접근

기존 GET handler를 기준 동작으로 유지하고 POST는 JSON body를 `URLSearchParams`로 변환해 같은 처리 함수로 위임한다. 이렇게 하면 프론트엔드 호출과 Postman 호출이 다른 로직으로 갈라지지 않는다.

## 리뷰 요약

- CEO 리뷰: 운영자가 후보 품질을 빠르게 확인할 수 있어 네이버 후보 조회 검증 속도가 좋아진다.
- 디자이너 리뷰: UI 변경이 없으므로 사용 흐름 영향은 없다.
- 개발자 리뷰: GET과 POST가 같은 handler를 공유해야 API drift를 막을 수 있다.
- 보안 이슈 리뷰: 관리자 import POST도 기존 `NAVER_IMPORT_ADMIN_TOKEN` 헤더 검증을 유지한다.
- DX 리뷰: collection/environment를 같이 제공해 base URL과 admin token을 Postman 변수로 관리한다.

## 검증 계획

- `npm test -- src/app/api/nearby-place-candidates/route.test.ts src/app/api/naver-places/route.test.ts docs/postman/postman-collection.test.ts`
- `npm run typecheck`

# PR #1 Code Review Risk Fixes

작성일: 2026-05-16

관련 PR: https://github.com/AnJuhwan/matzip-map-comunity/pull/1

## 배경

PR #1 코드리뷰에서 기능 구현 자체는 MVP 범위에 맞지만, 운영/보안 경계가 merge 전에 보강되어야 한다는 결론이 나왔다. 특히 익명 사용자가 운영자 moderation을 우회하거나, 네이버 API credential을 일반 사용자가 서버 비용으로 호출하거나, public Storage bucket에 임의 파일을 올릴 수 있는 경로가 리스크로 확인됐다.

이번 브랜치 `fix/code-review-risk-items`는 리뷰 코멘트의 P1/P2 항목과 코드로 닫기 쉬운 P3 항목을 좁게 수정한다.

팀에서 같은 흐름을 재사용할 수 있도록 repo-scoped Codex skill도 추가했다.

- Skill path: `.codex/skills/pr-review-to-notion/SKILL.md`
- Purpose: PR review comment를 코드 수정, PR 문서화, Notion 프로젝트/태스크, CEO/design/engineering review로 연결한다.
- Product review skill: `.codex/skills/matzip-review/SKILL.md`
- Product review trigger: `/matzip-review`
- Product review purpose: 필요한 reviewer persona만 자동 선택해 토의하고, 결정과 태스크를 Notion에 정리한다.

## 수정 요약

1. 운영자 숨김/삭제 상태 복구 우회 차단

- `supabase/schema.sql`의 places/reviews update policy를 강화했다.
- owner update는 기존 row가 `public`일 때만 허용한다.
- update 결과는 `public` 또는 `deleted`만 허용해 사용자의 soft delete는 유지하되, 운영자가 `hidden` 처리한 콘텐츠를 작성자가 다시 `public`으로 살리는 경로를 막았다.
- app update payload에서는 기존 row 수정 시 `status`를 다시 보내지 않도록 바꿨다.

2. 숨김/삭제된 가게의 리뷰 공개 노출 차단

- review select/insert/update policy에 연결된 place가 `public`인지 확인하는 `exists` 조건을 추가했다.
- place가 `hidden` 또는 `deleted`이면 review row 자체가 `public`이어도 공개 읽기에서 제외된다.
- local fallback에서도 공개 place에만 review를 저장하도록 맞췄다.

3. 네이버 지역 검색 import를 운영자 전용으로 전환

- `/api/naver-places` 호출에 `NAVER_IMPORT_ADMIN_TOKEN`과 `x-matzip-admin-token` 헤더 검증을 추가했다.
- 일반 사용자 UI의 “네이버” import 버튼과 자동 public 저장 흐름을 제거했다.
- 네이버 검색 결과는 운영자 검토 후보로 남기고, public 데이터 자동 복제 경로를 닫았다.

4. 사진 업로드 검증 추가

- 업로드 전 `validatePhotoFile`로 MIME type과 크기를 검증한다.
- 허용 형식은 JPG, PNG, WebP, GIF이고, SVG/비이미지/5MB 초과 파일은 차단한다.
- Supabase Storage bucket에도 `file_size_limit`과 `allowed_mime_types`를 설정했다.

5. production fallback과 geocode 오류 방어

- Supabase startup 오류가 production에서 localStorage fallback으로 조용히 전환되지 않도록 막았다.
- `/api/geocode`의 네트워크 오류와 malformed JSON 응답을 `{ error }` JSON으로 감싸도록 수정했다.

## 왜 이런 결과가 나왔나

- MVP의 핵심 UX는 로그인 없는 익명 작성이지만, 익명 작성자가 운영자 moderation보다 강한 권한을 가지면 커뮤니티 신뢰가 깨진다.
- 네이버 지역 검색 import는 운영 도구 성격이다. 일반 사용자에게 열어두면 API quota/cost 남용과 외부 장소 데이터 bulk copy 리스크가 생긴다.
- client-side `accept="image/*"`는 보안 경계가 아니다. public bucket은 서버/DB 정책과 app validation을 같이 둬야 한다.
- development fallback은 데모에는 좋지만, production에서는 “저장됨”처럼 보이는 데이터가 브라우저에만 남아 실제 서비스 데이터가 유실된 것처럼 보일 수 있다.
- route handler는 외부 API 장애를 Next.js 500으로 흘리지 않고, 앱이 기대하는 JSON 오류 형태를 유지해야 한다.

## CEO Review

이번 수정은 기능 추가보다 신뢰 손상 가능성을 먼저 줄인 작업이다. 맛집 커뮤니티 MVP는 초기에 콘텐츠 수가 중요하지만, 운영자가 숨긴 콘텐츠가 다시 노출되거나 외부 API가 남용되면 초기 신뢰를 회복하기 어렵다. 따라서 “더 많은 등록”보다 “운영자가 제어 가능한 공개 상태”와 “사용자에게 거짓 저장 성공을 만들지 않는 것”이 이번 단계의 더 큰 제품 가치다.

이 결정의 tradeoff는 운영자가 네이버 후보를 바로 UI에서 import하던 빠른 seed 흐름이 빠졌다는 점이다. 대신 후보 조회 API는 admin token으로 보호해 유지했으므로, 다음 PR에서 별도 운영자 화면이나 seed 스크립트로 되살리는 편이 안전하다.

## 후속 태스크

- [ ] 운영자 moderation UI: 신고 목록, 대상 미리보기, 숨김/삭제/복구 처리
- [ ] admin-only 네이버 후보 검토 화면 또는 seed 스크립트
- [ ] Supabase schema 적용 상태와 Naver credential health check
- [ ] 빈 상태에서 첫 맛집 등록 CTA
- [ ] 사진 업로드 전 압축과 미리보기

## 검증

```bash
npm test
# 7 files passed, 30 tests passed

npm run typecheck
# exit 0

npm run lint
# exit 0

npm run format:check
# All matched files use Prettier code style

npm run build
# Next.js 15.5.18 compiled successfully

npm run check:branch
# exit 0
```

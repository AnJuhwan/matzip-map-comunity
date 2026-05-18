# 자동 PR 리뷰 하네스

작성일: 2026-05-18

## 목적

Pull Request가 열리거나 갱신될 때마다 제품, 디자인, 엔지니어링, 기술 리더 관점의 리뷰를 자동으로 남긴다. 리뷰는 사람이 바로 판단할 수 있도록 한국어로 작성하고, 확인해야 할 코드에는 GitHub 링크를 붙인다.

이 문서는 자동화 구현 전에 기준을 고정하는 하네스 문서다. GitHub Actions, Codex, gstack, 별도 리뷰 봇 중 어떤 실행기를 쓰더라도 같은 입력, 관점, 출력 형식을 유지한다.

## 트리거

자동 리뷰는 다음 PR 이벤트에서 실행한다.

- `pull_request.opened`
- `pull_request.reopened`
- `pull_request.ready_for_review`
- `pull_request.synchronize`

Draft PR은 비용을 줄이기 위해 기본적으로 요약 리뷰만 남기고, `ready_for_review`가 된 뒤 전체 리뷰를 실행한다.

## 입력

리뷰 하네스는 매 실행마다 아래 자료를 수집한다.

- PR 제목, 본문, base branch, head branch
- `git diff --stat <base>...HEAD`
- `git diff --name-only <base>...HEAD`
- 변경된 파일의 patch와 변경 라인
- `README.md`
- `docs/project-decisions.md`
- `docs/code-conventions.md`
- `docs/pr-conventions.md`
- `docs/agent-planning-review-workflow.md`
- `docs/code-completion-review-workflow.md`
- `package.json`
- `tsconfig.json`
- `eslint.config.mjs`
- `.prettierrc.json`

Supabase, API route, 외부 API, 지도, 사진 업로드, 권한 관련 파일이 바뀌면 다음 자료도 함께 읽는다.

- `docs/operations.md`
- `supabase/schema.sql`
- `supabase/migrations/*`
- 관련 `*.test.ts` 또는 `*.test.tsx`
- `e2e/matzip-community.spec.ts`

## 자동 검증

기본 검증은 모든 non-draft PR에서 실행한다.

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

UI, 라우팅, 지도, 폼, Supabase 저장 흐름이 바뀐 PR은 추가로 실행한다.

```bash
npm run test:e2e
```

검증 결과는 PR 댓글에 명령별로 `통과`, `실패`, `미실행` 중 하나로 기록한다. 실패한 명령은 실패한 테스트 이름이나 에러 요지를 함께 남긴다.

## 리뷰 관점

### CEO 관점

제품 방향과 범위를 본다.

- 지금 MVP 단계에서 필요한 변경인가
- 지도 중심 첫 화면과 익명 작성 경험을 강화하는가
- 사용자가 실제로 더 쉽게 맛집을 찾거나 등록하게 되는가
- 범위가 커져서 핵심 경험을 흐리는 부분이 있는가
- PR 설명이 사용자 영향과 제품 결정을 충분히 설명하는가

### 디자이너 관점

사용자 흐름, 상태, 화면 밀도를 본다.

- 첫 화면에서 주요 행동인 탐색, 검색, 등록이 명확한가
- 모바일과 데스크톱에서 지도와 패널이 서로를 가리지 않는가
- 로딩, 빈 상태, 오류 상태, 권한 거부 상태가 자연스러운가
- 버튼, 폼, 모달, 지도 마커가 기존 톤과 맞는가
- 새 UI가 설명 문구에 기대지 않고 조작 가능한가

### 개발자 관점

구현 정확성, 테스트, 유지보수성을 본다.

- 요구사항과 diff가 일치하는가
- API, 상태 관리, 도메인 모델의 경계가 명확한가
- 실패 응답, 외부 API 실패, 환경변수 누락, 빈 데이터가 안전하게 처리되는가
- 새 동작을 검증하는 unit, route, e2e 테스트가 있는가
- 기존 사용자 데이터나 작성자 권한을 깨뜨릴 가능성이 없는가

### CTO 관점

장기 리스크와 운영 안전성을 본다.

- Supabase RLS, Storage policy, 익명 세션 경계가 유지되는가
- 운영 데이터가 브라우저 저장소나 개발용 fallback으로 새지 않는가
- 외부 API 장애, 속도 제한, secret 누락이 관찰 가능하게 실패하는가
- 확장보다 지금 필요한 단순성을 우선했는가
- 배포, 롤백, 모니터링 포인트가 PR에 드러나는가

### 코드 컨벤션과 FSD 관점

프로젝트 구조와 일관성을 본다.

- 파일명은 kebab-case, 컴포넌트는 PascalCase, 함수와 변수는 camelCase를 따른다.
- `src/app`은 라우팅과 route handler만 담당하고, 화면 조합은 `src/widgets`에 둔다.
- 사용자 행동 단위의 UI와 폼 로직은 `src/features/<feature-name>`에 둔다.
- 도메인 타입, 상수, 저장소 로직은 `src/entities/<entity-name>`에 둔다.
- 특정 도메인에 묶이지 않는 공용 코드는 `src/shared`에 둔다.
- 의존성 방향은 `app -> widgets -> features -> entities -> shared`를 따른다.
- 다른 slice에서 내부 파일을 직접 import하기보다 `index.ts` public API를 우선 사용한다.
- `"use client"`는 브라우저 API, 상태, 이벤트 핸들러가 필요한 파일에만 둔다.
- 공유 타입과 상수는 도메인 model에 모으고, 임의의 `string` 확장보다 literal union 또는 `as const` 배열을 우선한다.

## 변경 파일별 자동 라우팅

하네스는 변경 파일에 따라 집중 리뷰 영역을 추가한다.

| 변경 경로                 | 추가로 볼 것                                   | 필수 확인                                    |
| ------------------------- | ---------------------------------------------- | -------------------------------------------- |
| `src/app/api/**/route.ts` | API 계약, status code, 환경변수, 외부 API 실패 | route test와 실패 응답                       |
| `src/app/**/page.tsx`     | 라우팅 책임, URL 파라미터, 얇은 진입점 유지    | 실제 화면 로직이 widget/feature로 내려갔는지 |
| `src/widgets/**`          | 페이지 조합, 큰 상태 흐름, 사용자 여정         | 모바일/데스크톱 흐름과 e2e                   |
| `src/features/**`         | 사용자 행동 단위, 폼 검증, 이벤트 로직         | feature model test                           |
| `src/entities/**`         | 도메인 타입, 저장소, 권한, 데이터 무결성       | domain/store test                            |
| `supabase/**`             | RLS, migration 안전성, Storage policy          | schema test와 롤백 메모                      |
| `e2e/**`                  | 실제 사용자 흐름                               | 테스트가 구현 디테일보다 행동을 검증하는지   |
| `docs/**`                 | 기존 문서와 용어 일관성                        | README에서 2클릭 안에 찾을 수 있는지         |

## 항상 링크할 코드 지점

자동 리뷰 댓글에는 PR diff 외에도 아래 핵심 파일 링크를 상황에 맞게 붙인다. 링크는 changed file이 아니어도 "함께 봐야 하는 기준 파일"로 남긴다.

- 도메인 모델: `src/entities/community/model/domain.ts`
- Supabase 저장소: `src/entities/community/model/community-store.ts`
- 위치와 거리 계산: `src/entities/community/model/location.ts`
- 메인 화면 상태: `src/widgets/matzip-community/model/use-matzip-community.ts`
- 메인 화면 UI: `src/widgets/matzip-community/ui/matzip-community-app.tsx`
- 장소 입력 폼: `src/features/place-editor/ui/place-form.tsx`
- 리뷰 입력 폼: `src/features/review-editor/ui/review-form.tsx`
- 지도 렌더링: `src/features/place-map/ui/naver-map.tsx`
- 네이버 후보 변환: `src/features/naver-place-import/model/nearby-place-candidates.ts`
- 주소 검색 API: `src/app/api/geocode/route.ts`
- 네이버 후보 API: `src/app/api/nearby-place-candidates/route.ts`
- 운영자 import API: `src/app/api/naver-places/route.ts`
- Supabase schema: `supabase/schema.sql`
- 핵심 e2e: `e2e/matzip-community.spec.ts`

GitHub 링크는 다음 형식을 사용한다.

```text
https://github.com/AnJuhwan/matzip-map-comunity/blob/<commit-sha>/<path>#L<start>-L<end>
```

라인 범위를 모를 때는 파일 링크만 남기고, 자동 inline comment를 남길 수 있는 경우에는 변경 라인에 직접 코멘트한다.

## PR 댓글 형식

자동 리뷰는 PR에 하나의 요약 댓글을 남기고, 코드 문제는 가능한 경우 inline comment로 남긴다.

```markdown
## 자동 PR 리뷰

### 결론

- 상태: 통과 / 수정 필요 / 확인 필요
- 가장 먼저 볼 리스크: ...

### CEO 관점

- 생각: ...
- 우려: ...
- 제안: ...
- 확인 링크: ...

### 디자이너 관점

- 생각: ...
- 우려: ...
- 제안: ...
- 확인 링크: ...

### 개발자 관점

- 생각: ...
- 우려: ...
- 제안: ...
- 확인 링크: ...

### CTO 관점

- 생각: ...
- 우려: ...
- 제안: ...
- 확인 링크: ...

### 코드 컨벤션 / FSD

| 항목               | 상태                         | 근거 |
| ------------------ | ---------------------------- | ---- |
| FSD 의존성 방향    | 통과 / 수정 필요 / 확인 필요 | ...  |
| public API import  | 통과 / 수정 필요 / 확인 필요 | ...  |
| 파일명과 타입 위치 | 통과 / 수정 필요 / 확인 필요 | ...  |
| 테스트 위치        | 통과 / 수정 필요 / 확인 필요 | ...  |

### 자동 검증

- `npm run format:check`: 통과 / 실패 / 미실행
- `npm run lint`: 통과 / 실패 / 미실행
- `npm run typecheck`: 통과 / 실패 / 미실행
- `npm test`: 통과 / 실패 / 미실행
- `npm run build`: 통과 / 실패 / 미실행
- `npm run test:e2e`: 통과 / 실패 / 미실행 / 해당 없음

### 함께 봐야 하는 코드

- [도메인 모델](...)
- [메인 상태 흐름](...)
- [변경된 API route](...)
```

## Inline comment 기준

다음 문제는 요약 댓글에만 쓰지 말고 변경 라인에 직접 남긴다.

- 실제 버그나 사용자 회귀가 발생하는 코드
- FSD 의존성 방향을 거꾸로 만든 import
- `src/app`에 큰 화면 상태나 비즈니스 로직을 넣은 코드
- Supabase RLS, Storage, 작성자 권한을 약화하는 변경
- secret을 public env나 client bundle에 노출하는 변경
- 실패 응답이 사라진 API route
- 테스트가 있어야 하는데 없는 고위험 변경
- 기존 컨벤션과 다른 파일명, 타입 위치, public API 누락

취향이나 대안 제안은 inline comment보다 요약 댓글의 관점별 제안에 둔다.

## GitHub Actions 구현 초안

실제 자동화 파일을 만들 때는 `.github/workflows/pr-review.yml`에 아래 구조를 사용한다.

```yaml
name: PR Review Harness

on:
  pull_request:
    types: [opened, reopened, ready_for_review, synchronize]

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build

      # UI 관련 파일이 바뀐 경우에만 실행하도록 조건을 둔다.
      - run: npm run test:e2e

      # 이후 단계에서 diff, 문서, 검증 결과를 모아 리뷰 봇에 전달한다.
      # 봇은 이 문서의 관점과 댓글 형식을 그대로 사용한다.
```

리뷰 봇 단계는 실행기에 따라 달라진다. 어떤 실행기를 쓰든 최소 입력은 `diff`, `changed files`, `검증 결과`, `docs/*`, `package.json`이다.

## 실패 처리

자동 리뷰가 실패하면 PR에 짧은 실패 댓글을 남긴다.

- 검증 명령 실패: 실패 명령, 에러 요지, 다시 실행할 명령을 남긴다.
- 리뷰 봇 실패: 자동 검증 결과만 남기고 "관점별 리뷰 미실행"이라고 적는다.
- 권한 실패: `pull-requests: write` 권한과 repository settings를 확인하라고 적는다.
- 비용 또는 rate limit 실패: 전체 리뷰 대신 변경 파일 목록과 검증 결과만 남긴다.

자동 리뷰 실패는 merge를 무조건 막지 않는다. 단, `lint`, `typecheck`, `test`, `build` 실패는 required check로 설정해 merge를 막는다.

## 완료 기준

자동 PR 리뷰 하네스가 준비됐다고 보려면 다음을 만족해야 한다.

- PR 이벤트에서 기본 검증이 실행된다.
- PR 댓글이 CEO, 디자이너, 개발자, CTO, 코드 컨벤션/FSD 섹션을 모두 포함한다.
- 변경 파일별로 최소 하나 이상의 관련 코드 링크가 남는다.
- 실제 버그, 권한 약화, FSD 위반은 inline comment로 남는다.
- 문서만 변경한 PR은 과한 e2e를 생략하고 링크와 용어 일관성을 검증한다.
- 모든 사람이 같은 기준을 볼 수 있도록 이 문서가 `README.md`와 `docs/pr-conventions.md`에서 연결된다.

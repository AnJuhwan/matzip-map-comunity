# Git 컨벤션

## 커밋 메시지

커밋 메시지는 Conventional Commits 형식을 사용한다.

```text
<type>(optional-scope): <subject>
```

예시:

```text
feat(map): 맛집 마커 필터 추가
fix(ui): 모바일 카드 레이아웃 깨짐 수정
docs(readme): 실행 방법 추가
chore(deps): Next.js 패치 버전 업데이트
```

허용 타입:

```text
feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
```

규칙:

- `type`은 소문자로 작성한다.
- `scope`는 선택이며 소문자 또는 kebab-case로 작성한다.
- `subject` 끝에는 마침표를 붙이지 않는다.
- 제목은 100자 이내로 작성한다.
- breaking change는 `feat(api)!: ...` 또는 footer의 `BREAKING CHANGE: ...`로 표시한다.

## 브랜치 이름

작업 브랜치는 아래 형식을 사용한다.

```text
<type>/<issue-number>-<kebab-summary>
<type>/<kebab-summary>
```

예시:

```text
feat/12-map-filter
fix/marker-click
docs/update-readme
chore/setup-husky
refactor/map-page-state
```

허용되는 영구 브랜치:

```text
main, master, develop, dev, staging, production
```

작업 브랜치 규칙:

- `type`은 커밋 타입과 같은 목록을 사용한다.
- 설명은 영어 소문자, 숫자, 하이픈만 사용한다.
- 공백, 한글, 대문자, 밑줄은 사용하지 않는다.

# 네이버 지도 줌/이동 안정화 계획

작성일: 2026-05-17

기획 저장소: [코덱스 기획 창고](https://www.notion.so/363f1beebaaf804d808de2d9cf668c95)

> 사용자 승인 전까지 구현하지 않는다. 이 문서를 확인한 뒤 사용자가 "진행해"라고 말하면 코드 수정을 시작한다.

## 문제

사용자가 네이버 지도를 확대/축소하면 지도가 이상한 곳으로 이동한다.

또한 줌이 자유롭게 되지 않고 특정 줌 값으로 다시 돌아가는 것처럼 보인다.

## 원인 분석

### 원인 1. 사용자 지도 조작이 프로그램matic focus로 다시 해석됨

현재 흐름은 다음과 같다.

1. 사용자가 지도를 줌 또는 이동한다.
2. 네이버 지도 `idle` 이벤트가 발생한다.
3. `NaverMap`이 현재 bounds를 읽어 `onVisibleBoundsChange(bounds, areaQuery)`를 호출한다.
4. `useMatzipCommunity.handleVisibleBoundsChange`가 bounds 중심을 `mapFocusLocation`으로 저장한다.
5. `NaverMap`의 focus effect가 `focusLocation` 변경을 보고 `map.setCenter(...)`와 `map.setZoom(FOCUSED_MAP_ZOOM)`을 다시 호출한다.

즉, 사용자의 지도 조작 결과가 "검색/내 위치 이동 같은 의도적인 지도 포커스"와 같은 통로를 타면서 지도를 다시 움직인다.

### 원인 2. 줌 제한과 줌 스냅이 같이 존재함

- `new naver.maps.Map(..., { minZoom: 6 })` 때문에 줌 아웃 하한이 있다.
- focus effect가 매번 `map.setZoom(FOCUSED_MAP_ZOOM)`을 호출해 사용자가 선택한 줌을 16으로 되돌릴 수 있다.

## 목표

- 사용자가 줌/이동한 지도 중심과 줌 레벨을 앱이 다시 덮어쓰지 않게 한다.
- 내 위치 버튼, 최초 위치 확인, 검색어 이동처럼 명시적인 포커스 동작은 유지한다.
- 네이버 지도 줌 제한은 제거한다.
- bounds key 중복 방지와 음식점 후보 갱신 흐름은 유지한다.

## 하위 태스크

### 1. 지도 focus를 명시적 이벤트로만 적용

- 수정 영역:
  - `src/features/place-map/ui/naver-map.tsx`
  - `src/features/place-map/model/map-view.ts`
  - `src/features/place-map/model/map-view.test.ts`

- 만들 기능:
  - `locationFocusKey`가 새 값으로 증가했을 때만 `setCenter`/`setZoom`을 실행한다.
  - `focusLocation`이 지도 `idle`에서 갱신되는 것만으로는 지도 중심/줌을 다시 설정하지 않는다.

- 구현 방법:
  - `lastAppliedFocusKeyRef`를 `NaverMap`에 추가한다.
  - focus effect는 `locationFocusKey <= lastAppliedFocusKeyRef.current`면 즉시 반환한다.
  - 새 focus key일 때만 `lastAppliedFocusKeyRef.current = locationFocusKey` 후 중심 이동을 적용한다.

- 완료 조건:
  - 지도 줌/이동 후 bounds 갱신이 일어나도 `setZoom(16)`이 반복 호출되지 않는다.
  - 검색 또는 내 위치 버튼처럼 `locationFocusKey`가 증가하는 동작은 여전히 지도 중심을 이동한다.

- 검증:
  - `shouldApplyProgrammaticMapFocus(nextKey, lastAppliedKey)` 같은 작은 helper를 추가하고 단위 테스트를 만든다.

### 2. 네이버 지도 zoom 하한 제거

- 수정 영역:
  - `src/features/place-map/ui/naver-map.tsx`

- 만들 기능:
  - 네이버 지도 생성 옵션에서 `minZoom: 6`을 제거한다.

- 완료 조건:
  - SDK 기본 줌 범위 안에서 사용자가 자유롭게 줌 아웃/줌 인할 수 있다.

- 검증:
  - 코드 리뷰로 `minZoom` 설정 제거를 확인한다.
  - 브라우저에서 마우스 휠/트랙패드/지도 zoom control이 튕기지 않는지 확인한다.

### 3. bounds 갱신은 데이터 로딩에만 사용

- 수정 영역:
  - `src/widgets/matzip-community/model/use-matzip-community.ts`
  - `src/widgets/matzip-community/model/use-matzip-community.test.ts`

- 만들 기능:
  - 지도 `idle`에서 들어온 bounds는 `visibleMapBounds`, 후보 조회, 저장된 리뷰 조회에 사용한다.
  - 하지만 지도 중심을 다시 강제 이동시키는 trigger로 사용하지 않는다.

- 구현 방법:
  - 현재 `setMapFocusLocation(nextMapFocusLocation)`은 후보 조회 위치 기준으로는 유지할 수 있다.
  - 실제 지도 이동은 Task 1의 focus key guard로 차단한다.
  - 필요하면 변수명을 추후 `candidateLookupLocation`으로 바꾸는 리팩터링은 별도 작업으로 둔다.

- 완료 조건:
  - `handleVisibleBoundsChange` 호출 후 후보 API는 새 bounds 중심으로 호출된다.
  - 같은 호출이 `locationFocusKey` 증가 없이 지도 `setCenter`를 다시 유발하지 않는다.

- 검증:
  - 기존 hook 테스트가 계속 통과해야 한다.
  - 가능하면 `handleVisibleBoundsChange`가 `locationFocusKey`를 증가시키지 않는다는 테스트를 추가한다.

## 리뷰

### CEO 리뷰

- 생각: 사용자가 직접 지도를 만지는 순간은 제품의 핵심 탐색 행동이다.
- 우려: 앱이 사용자의 줌/이동을 되돌리면 "내가 조작한다"는 감각이 깨진다.
- 결정: 데이터 갱신과 지도 포커스 이동을 분리해 지도 조작권을 사용자에게 돌려준다.

### 디자이너 리뷰

- 생각: 검색/내 위치 버튼은 명시적인 이동이고, 손가락/마우스 줌은 자유 탐색이다.
- 우려: 자유 탐색 중 지도가 튀면 음식점 마커가 많고 적은 문제보다 먼저 신뢰가 깨진다.
- 결정: 지도 idle 이후에는 목록/마커만 갱신하고, 화면 중심과 줌은 사용자가 만든 상태를 존중한다.

### 개발자 리뷰

- 생각: root cause는 `focusLocation` 상태와 `locationFocusKey`의 책임이 섞인 것이다.
- 우려: 단순히 `setZoom`만 지우면 검색/내 위치 이동의 의도된 UX가 약해질 수 있다.
- 결정: `locationFocusKey` 증가를 프로그램matic focus의 유일한 트리거로 삼고, 같은 key에서는 effect를 무시한다.

### 보안 이슈 리뷰

- 생각: 이번 수정은 클라이언트 지도 상태 제어이며 새로운 외부 데이터/권한을 추가하지 않는다.
- 우려: 없음. 다만 디버깅 로그를 추가한다면 좌표/위치 정보가 콘솔에 과도하게 남지 않도록 해야 한다.
- 결정: 영구 로그나 새 telemetry 없이 테스트와 코드 구조로 검증한다.

### DX 리뷰

- 생각: 지도 SDK 동작은 jsdom에서 완전 재현하기 어렵기 때문에 작은 helper로 핵심 조건을 테스트하는 편이 낫다.
- 우려: 브라우저 수동 확인 없이 단위 테스트만으로는 실제 줌 튕김을 놓칠 수 있다.
- 결정: 단위 테스트 + typecheck/lint + 브라우저 수동 확인을 완료 조건으로 둔다.

## 선택한 방법

방법 A: `locationFocusKey` 기반 guard를 추가하고 `minZoom`을 제거한다.

선택 이유:

- 현재 구조를 크게 흔들지 않는다.
- 검색/내 위치 이동은 유지하면서 사용자 줌/이동만 자유롭게 만든다.
- bounds 기반 음식점 후보 갱신 로직을 그대로 유지할 수 있다.

## 테스트와 검증 방법

- `npm test -- src/features/place-map/model/map-view.test.ts`
- `npm test -- src/widgets/matzip-community/model/use-matzip-community.test.ts`
- `npm run typecheck`
- `npm run lint`
- 브라우저에서 확인:
  - 지도 확대/축소가 16으로 되돌아가지 않는지
  - 줌 아웃이 `minZoom: 6`에 막히지 않는지
  - 검색어 이동과 내 위치 버튼은 여전히 지도 중심을 이동하는지
  - 지도 이동 후 음식점 후보는 새 화면 기준으로 갱신되는지

## 구현 결과

구현일: 2026-05-17

- `shouldApplyProgrammaticMapFocus(nextFocusKey, lastAppliedFocusKey)` helper를 추가했다.
- `NaverMap`이 같은 `locationFocusKey`로는 `setCenter`/`setZoom(16)`을 다시 호출하지 않도록 `lastAppliedFocusKeyRef` guard를 추가했다.
- 네이버 지도 생성 옵션에서 `minZoom: 6`을 제거했다.
- 지도 `idle` 이벤트에서 bounds와 지역명은 계속 후보/리뷰 데이터 로딩에 사용하되, 사용자 zoom/pan을 다시 프로그램matic focus로 덮어쓰지 않게 했다.

## 검증 결과

- `npm test -- src/features/place-map/model/map-view.test.ts`: 통과
- `npm test -- src/features/place-map/model/map-view.test.ts src/widgets/matzip-community/model/use-matzip-community.test.ts`: 통과
- `npm test`: 12개 파일, 72개 테스트 통과
- `npm run typecheck`: 통과
- `npm run lint`: 통과
- `npm run build`: 통과

## 상태

구현 완료.

## 승인 대기 기록

이 문서 확인 후 사용자가 "진행해"라고 말하면 구현을 시작한다.

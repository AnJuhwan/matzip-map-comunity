# 네이버 후보 API 중복 호출 방지 계획

작성일: 2026-05-17

기획 저장소: [코덱스 기획 창고](https://www.notion.so/363f1beebaaf804d808de2d9cf668c95)

> 사용자 승인 전까지 구현하지 않는다. 이 문서를 확인한 뒤 사용자가 "진행해"라고 말하면 코드 수정을 시작한다.

## 문제

지도 화면에서 `/api/nearby-place-candidates`가 같은 화면/검색 상태에 대해 여러 번 호출되는 것으로 보인다.

추가로, 위치 확정 전 또는 geocode fallback 상황에서 엉뚱한 좌표로 후보 API가 먼저 호출될 수 있다. 사용자가 관찰한 증상은 "대전 같은 엉뚱한 지역이 찍힌 뒤 다시 내 위치로 돌아옴"이다.

네이버 검색 API는 호출량 제한이 있으므로 같은 bounds와 같은 검색어에 대한 중복 요청은 줄여야 한다.

더 중요한 우선순위는 잘못된 좌표로 후보 API를 호출하지 않는 것이다. dedupe는 같은 요청 반복을 줄이는 장치일 뿐, 잘못된 좌표로 나가는 첫 요청을 정당화하지 않는다.

## 원인 분석

### 원인 1. bounds report effect가 callback identity 변화로 재실행될 수 있음

현재 `NaverMap`의 bounds reporting effect는 `onVisibleBoundsChange`에 의존한다.

```ts
useEffect(() => {
  reportVisibleBounds();
  const listener = naverMaps.Event.addListener(map, "idle", reportVisibleBounds);
  return () => naverMaps.Event.removeListener(listener);
}, [mapLoadState, onVisibleBoundsChange]);
```

그런데 `onVisibleBoundsChange`는 `useMatzipCommunity.handleVisibleBoundsChange`이고, 이 함수는 `loadNearbyCandidates`에 의존한다. `loadNearbyCandidates`는 다시 `mapFocusLocation`, `visibleMapBounds`에 의존한다.

즉, bounds 변경으로 상태가 바뀌면 callback이 새로 만들어지고, `NaverMap` effect가 다시 실행되면서 `reportVisibleBounds()`가 즉시 호출될 수 있다.

### 원인 2. `candidateLoadIdRef`는 중복 네트워크 요청을 막지 않음

`candidateLoadIdRef`는 최신 응답만 화면에 반영하기 위한 guard다.

이미 같은 URL로 요청이 나가는 것은 막지 않는다.

### 원인 3. 검색 흐름은 1차 후보 요청과 지도 idle 후보 요청이 겹칠 수 있음

검색 시 `moveToSearchQueryLocation`은 geocode 후 바로 `loadNearbyCandidates(nextQuery, ..., nextLocation)`를 호출한다.

그 뒤 지도 중심 이동이 실제로 일어나면 `idle`에서 다시 visible bounds 기반 후보 요청이 발생할 수 있다.

### 원인 4. 개발 모드에서는 React effect가 더 자주 실행될 수 있음

Next/React 개발 모드에서는 effect가 검증 목적으로 더 많이 실행될 수 있다. 이 경우 운영 빌드보다 중복 요청이 더 잘 보일 수 있다.

다만 개발 모드 특성을 이유로 방치하지 않고, 앱 레벨에서 같은 request key를 dedupe한다.

### 원인 5. 초기 위치 상태가 fallback 좌표를 실제 위치처럼 들고 있음

현재 `userLocation`과 `mapFocusLocation`은 초기값부터 `DEFAULT_USER_LOCATION`이다.

```ts
const [userLocation, setUserLocation] = useState<UserLocation>(DEFAULT_USER_LOCATION);
const [mapFocusLocation, setMapFocusLocation] =
  useState<Pick<UserLocation, "latitude" | "longitude">>(DEFAULT_USER_LOCATION);
```

위치 상태가 `idle` 또는 `requesting`이어도 좌표 값은 이미 존재하므로, 지도 fallback bounds 계산이나 후보 lookup 위치 계산에 이 좌표가 섞일 수 있다.

### 원인 6. geocode fallback 좌표가 검색 실패를 실제 검색 위치처럼 만들 수 있음

`/api/geocode`는 네이버 지오코딩과 지역 검색이 모두 실패하면 `fallbackCoordinate(query)`를 반환할 수 있다.

이 fallback은 검색어 seed에 따라 서울, 부산, 대구, 대전, 광주, 제주 중 하나의 임의 anchor를 반환한다. 이 값이 `source: "fallback"`인데도 `moveToSearchQueryLocation`은 검색 성공처럼 처리한다.

그 결과 검색어에 따라 대전 같은 임의 좌표로 지도 focus와 후보 API 요청이 발생한 뒤, 브라우저 위치가 다시 들어오며 내 위치로 돌아오는 흐름이 생길 수 있다.

## 목표

- 같은 `query + areaQuery + bounds + categories` 조합은 한 번만 요청한다.
- 같은 요청이 이미 진행 중이면 새 네트워크 요청을 시작하지 않는다.
- 같은 요청이 직전에 성공했으면 불필요하게 다시 호출하지 않는다.
- 위치가 확정되기 전에는 fallback 좌표로 후보 API를 호출하지 않는다.
- geocode 결과가 `source: "fallback"`이면 실제 검색 위치처럼 지도 focus와 후보 API에 사용하지 않는다.
- `DEFAULT_USER_LOCATION`은 UI 안전값으로만 사용하고, 후보 API lookup location에는 검증된 위치만 사용한다.
- 지도 idle로 후보 갱신은 유지한다.
- 검색/내 위치 이동 후 실제 bounds 기준 후보 갱신은 유지하되 중복 호출은 막는다.
- 내 위치 버튼을 누르면 `?search=...` 공유 URL 상태도 같이 비운다.

## 하위 태스크

### 1. 위치 확정 전 fallback 후보 요청 차단

- 수정 영역:
  - `src/widgets/matzip-community/model/use-matzip-community.ts`
  - `src/widgets/matzip-community/model/use-matzip-community.test.ts`

- 만들 기능:
  - 후보 API 호출 전에 lookup 위치가 신뢰 가능한지 확인한다.
  - 신뢰 가능한 위치:
    - 브라우저 위치가 `ready`
    - 검색 위치가 `source: "naver"` 또는 `source: "naver-local-search"`
    - 실제 지도 bounds가 이미 들어와 그 중심을 lookup location으로 쓰는 경우
  - 신뢰하지 않는 위치:
    - `locationStatus`가 `idle` 또는 `requesting`
    - `DEFAULT_USER_LOCATION` 기반 fallback
    - geocode 응답의 `source: "fallback"`

- 완료 조건:
  - 위치 요청 중에는 `DEFAULT_USER_LOCATION`으로 `/api/nearby-place-candidates`가 호출되지 않는다.
  - 브라우저 위치가 성공하면 실제 브라우저 위치 또는 실제 지도 bounds 기준으로만 호출된다.
  - 위치 실패 fallback은 사용자에게 fallback 지도 UI를 보여줄 수는 있지만, 엉뚱한 후보 API 요청은 자동으로 보내지 않는다.

- 검증:
  - hook 테스트에서 geolocation이 아직 응답하지 않은 상태로 `handleVisibleBoundsChange`가 호출되어도 후보 API가 나가지 않는지 확인한다.
  - geolocation 성공 후에는 후보 API가 나가는지 확인한다.

### 2. geocode fallback을 검색 위치로 쓰지 않기

- 수정 영역:
  - `src/widgets/matzip-community/model/use-matzip-community.ts`
  - `src/widgets/matzip-community/model/use-matzip-community.test.ts`
  - 필요 시 `src/app/api/geocode/route.ts`

- 만들 기능:
  - `geocodeQuery`가 `source: "fallback"`을 받으면 검색 위치로 인정하지 않는다.
  - `moveToSearchQueryLocation`은 fallback geocode로 `mapFocusLocation`을 이동시키지 않는다.
  - fallback geocode일 때는 기존 지도 bounds가 있으면 그 bounds 안에서 query 후보 검색을 시도하거나, 명확한 메시지를 보여준다.

- 완료 조건:
  - 검색어가 geocode fallback으로만 해석될 때 대전/부산/제주 같은 임의 좌표로 지도와 후보 API가 움직이지 않는다.
  - 네이버 지역 검색으로 좌표가 확인된 검색어는 기존처럼 이동한다.

- 검증:
  - `/api/geocode` mock이 `source: "fallback"`을 반환하는 테스트를 추가한다.
  - 해당 테스트에서 `mapFocusLocation`이 fallback 좌표로 바뀌지 않고, 후보 API도 fallback 좌표로 호출되지 않는지 확인한다.

### 3. 후보 요청 key helper 추가

- 수정 영역:
  - `src/widgets/matzip-community/model/use-matzip-community.ts`
  - `src/widgets/matzip-community/model/use-matzip-community.test.ts`

- 만들 기능:
  - 요청 dedupe용 key를 만든다.
  - key 구성: normalized query, normalized areaQuery, categories, bounds(`toFixed(5)`), lookup location(`toFixed(5)`).

- 완료 조건:
  - 같은 bounds/query/areaQuery는 같은 key를 만든다.
  - 소수점 노이즈는 `toFixed(5)`로 흡수한다.
  - 다른 query나 areaQuery는 다른 key를 만든다.

- 검증:
  - helper 단위 테스트 추가.

### 4. in-flight / last-success request dedupe 추가

- 수정 영역:
  - `src/widgets/matzip-community/model/use-matzip-community.ts`
  - `src/widgets/matzip-community/model/use-matzip-community.test.ts`

- 만들 기능:
  - `inFlightCandidateRequestKeyRef`와 `lastCompletedCandidateRequestKeyRef`를 둔다.
  - `loadNearbyCandidates` 시작 전에 request key를 계산한다.
  - 같은 key가 진행 중이면 return한다.
  - 같은 key가 직전에 완료됐고 강제 reload가 아니면 return한다.
  - 실패한 요청은 `lastCompletedCandidateRequestKeyRef`에 저장하지 않는다.

- 완료 조건:
  - 같은 bounds/areaQuery를 연속으로 report해도 API는 1번만 호출된다.
  - 진행 중 요청이 있을 때 같은 key 요청은 추가 fetch를 만들지 않는다.
  - 다른 bounds나 다른 query는 새 요청을 만든다.

- 검증:
  - hook 테스트에서 같은 `handleVisibleBoundsChange(bounds, "마곡동")`를 두 번 호출했을 때 `/api/nearby-place-candidates` fetch 횟수가 1번인지 확인한다.
  - 다른 bounds를 호출하면 2번째 요청이 생기는지 확인한다.

### 5. callback identity 안정화

- 수정 영역:
  - `src/widgets/matzip-community/model/use-matzip-community.ts`
  - `src/features/place-map/ui/naver-map.tsx`

- 만들 기능:
  - `loadNearbyCandidates`가 `mapFocusLocation`과 `visibleMapBounds` state에 직접 의존하지 않도록 한다.
  - 최신 `mapFocusLocation`, `visibleMapBounds`는 refs로 보관한다.
  - `handleVisibleBoundsChange`가 불필요하게 새로 만들어지는 일을 줄인다.

- 완료 조건:
  - bounds 변경으로 인해 `NaverMap`의 bounds reporting effect가 다시 구독/즉시 report하는 횟수가 줄어든다.
  - 기존 검색, 내 위치, 지도 이동 동작은 유지된다.

- 검증:
  - 기존 hook 테스트 전체가 통과해야 한다.
  - 새 중복 호출 테스트가 통과해야 한다.

### 6. 검색 직후 후보 요청 정책 정리

- 수정 영역:
  - `src/widgets/matzip-community/model/use-matzip-community.ts`

- 선택지:
  - 방법 A: 검색 직후 즉시 후보 요청은 유지하고 request key dedupe로 중복만 제거한다.
  - 방법 B: 검색 직후 즉시 후보 요청을 없애고, 지도 focus 후 첫 `idle`에서만 후보를 가져온다.

- 선택:
  - 방법 A를 우선 선택한다.

- 선택 이유:
  - 지도 SDK가 실패하거나 fallback 지도일 때도 검색 결과 후보를 빠르게 받을 수 있다.
  - dedupe가 있으면 같은 요청 반복 문제는 줄일 수 있다.
  - 방법 B는 UX가 더 깔끔할 수 있지만 지도 SDK 이벤트 의존도가 커진다.

### 7. 내 위치 버튼에서 검색 URL 정리

- 수정 영역:
  - `src/widgets/matzip-community/model/use-matzip-community.ts`
  - `src/widgets/matzip-community/ui/matzip-community-app.tsx`

- 만들 기능:
  - 내 위치 요청 시 hook의 `query`, `appliedQuery`, trusted search focus를 비운다.
  - 앱 레벨에서 `router.replace("/")`를 호출해 `?search=...`를 제거한다.

- 완료 조건:
  - 검색 공유 URL에서 내 위치 버튼을 눌러도 이전 검색어가 후보 필터나 URL에 남지 않는다.
  - 내 위치 마커는 브라우저 위치 성공 시 기존처럼 실제 위치로 돌아온다.

## 구현 결과

- `loadNearbyCandidates`에 request key 기반 `inFlight` / `lastCompleted` dedupe를 추가했다.
- 위치 상태가 `ready`가 아니고 검색 좌표도 검증되지 않은 경우 후보 API를 호출하지 않도록 막았다.
- `/api/geocode`가 `source: "fallback"`을 반환하면 지도 focus와 후보 API lookup 위치로 쓰지 않는다.
- 위치 상태, 지도 focus, visible bounds ref를 상태 변경 시 즉시 동기화해 빠른 지도 이벤트에서도 오래된 좌표를 쓰지 않게 했다.
- 같은 bounds와 areaQuery가 반복 report되면 `/api/nearby-place-candidates`를 1번만 호출하도록 테스트로 고정했다.
- 내 위치 버튼 클릭 시 검색 state와 `?search=...` URL을 함께 제거하도록 연결했다.

## 리뷰

### CEO 리뷰

- 생각: API 호출량이 늘면 네이버 후보가 안 뜨는 문제가 다시 생긴다.
- 우려: 사용자에게는 "음식점이 적다"보다 "엉뚱한 지역이 찍힌다"가 더 치명적이다.
- 결정: 잘못된 위치 요청 차단을 1순위로 두고, 그 다음 중복 호출을 줄인다.

### 디자이너 리뷰

- 생각: 지도 이동 후 후보가 자연스럽게 바뀌는 경험은 유지해야 한다.
- 우려: 앱이 대전/부산 같은 임의 위치를 잠깐 보여주면 사용자는 지도 자체를 믿지 못한다.
- 결정: 위치 확정 전에는 후보를 비워두더라도 엉뚱한 위치를 보여주지 않는다.

### 개발자 리뷰

- 생각: root cause는 "stale response guard"와 "network request dedupe"가 분리되지 않은 것이다.
- 우려: fallback 좌표가 `UserLocation`과 `GeocodeResult`에서 실제 좌표처럼 취급되고 있다.
- 결정: trusted lookup location과 UI fallback location을 분리하고, request key dedupe와 callback 안정화를 같이 한다.

### 보안 이슈 리뷰

- 생각: 이번 변경은 외부 API 호출 횟수를 줄이는 방향이라 보안/운영 리스크를 낮춘다.
- 우려: dedupe key에 사용자 위치 좌표가 포함되지만 클라이언트 메모리 ref에만 저장된다.
- 결정: 영구 저장, 로그, URL 추가 없이 메모리 dedupe만 사용하고, fallback 좌표를 외부 API에 보내지 않는다.

### DX 리뷰

- 생각: 중복 호출은 네트워크 패널에서만 보면 원인 구분이 어렵다.
- 우려: React dev mode와 실제 로직 중복이 섞여 보일 수 있다.
- 결정: hook 단위 테스트에서 fetch 횟수로 고정하고, 브라우저 네트워크 패널로 수동 확인한다.

## 테스트와 검증 방법

- `npm test -- src/widgets/matzip-community/model/use-matzip-community.test.ts`
- `npm test -- src/features/place-map/model/map-view.test.ts`
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npx prettier --check src/widgets/matzip-community/model/use-matzip-community.ts src/widgets/matzip-community/model/use-matzip-community.test.ts src/widgets/matzip-community/ui/matzip-community-app.tsx src/features/place-map/model/map-view.ts src/features/place-map/ui/naver-map.tsx src/features/place-map/model/map-view.test.ts`
- `curl -I http://localhost:3109`

## 검증 결과

- `npm test -- src/widgets/matzip-community/model/use-matzip-community.test.ts`: 통과, 15 tests
- `npm test -- src/features/place-map/model/map-view.test.ts`: 통과, 13 tests
- `npm test`: 통과, 12 files / 77 tests
- `npm run typecheck`: 통과
- `npm run lint`: 통과
- `npm run build`: 통과
- touched file Prettier check: 통과
- `npm run format:check`: 실패. 이번 수정 파일은 통과했지만, 레포에 기존 포맷 불일치 파일 21개가 남아 있다.
- `curl -I http://localhost:3109`: 200 OK. 기존 dev 서버가 `.next` 임시 파일 오류로 500을 내서 재시작했다.
- 브라우저에서 확인:
  - 위치 권한 응답 전에는 대전/부산/제주 같은 임의 위치 후보 API가 나가지 않는지
  - geocode fallback 검색어가 임의 좌표로 지도와 후보 API를 움직이지 않는지
  - 초기 지도 진입 시 같은 `/api/nearby-place-candidates` URL이 반복 호출되지 않는지
  - 같은 위치에서 살짝 흔들리는 idle 이벤트가 중복 요청을 만들지 않는지
  - 지도 bounds를 실제로 이동하면 새 요청이 1번 발생하는지
  - 검색 후 후보가 보이고 같은 요청이 과도하게 반복되지 않는지

## 진행 상태

사용자가 "이거까지 한다음 그냥 바로 진행해"라고 승인해 구현까지 완료했다.

// candidate_search.js
// [의사코드] 좌표 기반 후보 검색 — 거리 계산·필터·스코어링.
//
// 이 파일이 보여주는 것: 도메인 로직을 DOM에서 떼어낸 구조.
// document도 chrome API도 쓰지 않는 순수 함수만 둔다 — 화면과 무관하게 테스트된다.
//
// 한 지역에서 후보가 부족하면 인접 지역까지 범위를 넓혀 조회한 뒤, 거리순으로
// 합쳐 보여준다 — 사용자가 여러 지역을 손으로 번갈아 조회하던 일을 대신한다.

// 검색 세션 — 호출부(driver)가 만들고 이 모듈에 위임한다.
function createSession({ origin, maxDistanceKm, needed }) {
  return { origin, maxDistanceKm, needed, collected: [], visitedScopes: [], aborted: false };
}

// 넓혀갈 범위를 가까운 순으로 돌려준다. 충분히 모였거나 중단되면 멈춘다.
function* expandingScopes(session) {
  for (const scope of scopesByDistance(session.origin)) {
    if (session.aborted || session.collected.length >= session.needed) return;
    session.visitedScopes.push(scope);
    yield scope;
  }
}

function addFound(session, rows) {
  const scored = rows
    .map((r) => ({ ...r, distanceKm: haversine(session.origin, r.coords) }))
    .filter((r) => r.distanceKm <= session.maxDistanceKm)
    .filter((r) => isUsable(r));            // 상태·점검 여부 등으로 제외
  session.collected.push(...dedupeById(scored));
}

// 최종 정렬: 거리 우선, 같으면 더 빨리 쓸 수 있는 쪽.
function rank(session) {
  return [...session.collected].sort((a, b) =>
    a.distanceKm - b.distanceKm || availableAt(a) - availableAt(b));
}

function haversine(a, b) { /* 두 좌표 사이 대권거리(km) */ }

// 중단은 플래그로 표시하고, 진행 중인 조회는 다음 단계에서 스스로 멈춘다.
// 부분 결과가 화면에 남지 않도록 경계에서만 중단한다.
function abort(session) { session.aborted = true; }

// [pseudo-code] candidate_search.ts
// 좌표 기반 후보 검색 — 거리 계산·필터·스코어링.
// DOM과 chrome API를 쓰지 않는 순수 함수만 둔다.
// 후보가 부족하면 인접 범위까지 넓혀 조회한 뒤 거리순으로 합친다.

// 인자: 기준 좌표, 최대 거리, 필요 개수. 반환: 검색 세션.
function createSession({ origin, maxDistanceKm, needed }: SessionInput): Session {
  return { origin, maxDistanceKm, needed, collected: [], visitedScopes: [], aborted: false };
}

// 인자: 세션. 반환: 가까운 순의 범위. 충분히 모였거나 중단되면 멈춘다.
function* expandingScopes(session: Session): Generator<string> {
  for (const scope of scopesByDistance(session.origin)) {
    if (session.aborted || session.collected.length >= session.needed) return;
    session.visitedScopes.push(scope);
    yield scope;
  }
}

function addFound(session: Session, rows: Candidate[]): void {
  const scored = rows
    .map((r) => ({ ...r, distanceKm: haversine(session.origin, r.coords) }))
    .filter((r) => r.distanceKm <= session.maxDistanceKm)
    .filter((r) => isUsable(r));            // 상태·점검 여부 등으로 제외
  session.collected.push(...dedupeById(scored));
}

// 인자: 세션. 반환: 거리 오름차순, 동률이면 가용 시각 순의 후보 목록.
function rank(session: Session): Candidate[] {
  return [...session.collected].sort((a, b) =>
    a.distanceKm - b.distanceKm || availableAt(a) - availableAt(b));
}

function haversine(a: Coords, b: Coords): number { /* 두 좌표 사이 대권거리(km) */ return 0; }

// 인자: 세션. 중단 플래그를 세운다. 진행 중인 조회는 다음 경계에서 멈춘다.
function abort(session: Session): void { session.aborted = true; }

interface SessionInput { origin: Coords; maxDistanceKm: number; needed: number }
interface Candidate { id: string; coords: Coords; distanceKm: number }
interface Session extends SessionInput {
  collected: Candidate[];
  visitedScopes: string[];
  aborted: boolean;
}

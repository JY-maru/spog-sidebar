// candidate_search.js
// [MOCK] 좌표 기반 후보 리소스 검색 — 순수 함수 위주로 DOM에 의존하지
// 않게 분리되어 있어 유닛 테스트하기 좋은 모듈. 예약·배차 시스템 콘텐츠 스크립트
// (dispatch_system_driver.js)가 세션 오브젝트를 만들고 이 모듈에 위임하는 구조.
//
// 사용 패턴:
//   const session = await CandidateSearch.startSearch(resId, { selectedCategories, onProgress });
//   const filtered = CandidateSearch.applyFilter(session, ['PLUS', 'PRO']);
//   if (부족하면) await CandidateSearch.expandSearch(session, { selectedCategories, onProgress });

const MAX_RETRY = 3;
const DEFAULT_MIN_RESULTS = 5;
const RADIUS_STEPS_KM = [5, 10, 20, 30, 50]; // 확장 검색 시 순차적으로 넓히는 반경

function toRad(deg) { return (deg * Math.PI) / 180; }
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function computeBearing(lat1, lng1, lat2, lng2) {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function isFullyAvailable(resource) {
  return resource.status === 'AVAILABLE' && !resource.reservedRanges?.some((r) => r.overlaps(resource.requestedRange));
}
function isPremiumTier(resource) { return resource.tier === 'PRIME'; }

function filterCandidateResources(rawCandidates, { startAt, endAt, originIsPremiumTier, distKm, address }) {
  return rawCandidates
    .filter((r) => isFullyAvailable(r))
    .filter((r) => !originIsPremiumTier || isPremiumTier(r)) // 프라임 등급 기준 리소스면 프라임끼리만 매칭
    .map((r) => ({ ...r, distKm, address, startAt, endAt }));
}

// ── 리소스 유형 티어링 — "같은 유형 있으면 같은 유형만 → 없으면 같은 등급만
//    → 그것도 없으면 같은 등급+상위 등급"으로 자동 완화한다. 사용자가 직접
//    체크박스를 선택한 경우(selectedCategories가 채워진 경우)에는 이 자동
//    티어링을 건너뛰고 선택 그대로 존중한다. ──
function getAllowedTiers(originTier, tier) {
  const TIER_ORDER = ['STANDARD', 'PLUS', 'PRO', 'ELITE'];
  const idx = TIER_ORDER.indexOf(originTier);
  if (tier === 'same-tier-and-above') return TIER_ORDER.slice(idx);
  return [originTier];
}
function tieredMatches(rawResources, originType, originTier) {
  const sameType = rawResources.filter((r) => r.resourceType === originType);
  if (sameType.length > 0) return { list: sameType, tier: 'same-type' };
  const sameTier = rawResources.filter((r) => r.resourceTier === originTier);
  if (sameTier.length > 0) return { list: sameTier, tier: 'same-tier' };
  const allowed = getAllowedTiers(originTier, 'same-tier-and-above');
  return { list: rawResources.filter((r) => allowed.includes(r.resourceTier)), tier: 'same-tier-and-above' };
}
function tieredMatchesForSelection(rawResources, originType, selectedCategories) {
  return { list: rawResources.filter((r) => selectedCategories.includes(r.resourceTier) || selectedCategories.includes(r.resourceType)) };
}
function countMatching(rawResources, selectedCategories, resourceTypeFilter, session, premiumOnly) {
  let list;
  if (resourceTypeFilter) list = rawResources.filter((r) => r.resourceType.includes(resourceTypeFilter));
  else if (selectedCategories?.length) list = tieredMatchesForSelection(rawResources, session?.originResourceType, selectedCategories).list;
  else if (session) list = tieredMatches(rawResources, session.originResourceType, session.originResourceTier).list;
  else list = rawResources;
  if (premiumOnly) list = list.filter(isPremiumTier);
  return list.length;
}

// ── 기준 예약(resId)의 원본 좌표/리소스 유형을 조회 — 검색 시작 시 재조회하지
//    않도록 호출자가 미리 캐싱해서 재사용하는 경우가 많다. ──
async function parseReservationOrigin(resId) {
  const res = await fetch(`/api/reservation/${resId}/origin`);
  const data = await res.json();
  return {
    regionId: data.regionId, regionName: data.regionName, lat: data.lat, lng: data.lng,
    resourceId: data.resourceId, resourceType: data.resourceType, resourceTier: data.resourceTier,
    startAt: data.startAt, endAt: data.endAt,
  };
}

async function fetchRegionNeighbors(regionId, lat, lng, signal) {
  const res = await fetch(`/api/region/${regionId}/neighbors`, { signal });
  return (await res.json()).regions; // [{regionId, lat, lng, address}, ...]
}
async function fetchResourcesForRegion(regionId, startAt, endAt, signal) {
  const res = await fetch(`/api/region/${regionId}/resources?startAt=${startAt}&endAt=${endAt}`, { signal });
  return (await res.json()).resources;
}

async function discoverFromCenter(regionId, discovered, centerLat, centerLng, signal) {
  const neighbors = await fetchRegionNeighbors(regionId, centerLat, centerLng, signal);
  const searchRegions = [];
  const nextCenterRegions = [];
  for (const z of neighbors) {
    if (discovered.has(z.regionId)) continue;
    const distKm = haversineKm(centerLat, centerLng, z.lat, z.lng);
    discovered.set(z.regionId, { ...z, distKm });
    searchRegions.push(z.regionId);
    if (distKm < 3) nextCenterRegions.push(z.regionId); // 가까운 region은 다음 웨이브의 새 중심 후보로
  }
  return { searchRegions, nextCenterRegions };
}

// ── 검색 시작 — 기준 region부터 1홉 이웃을 즉시 조회해 첫 결과를 빠르게 보여준다 ──
async function startSearch(resId, { origin, selectedCategories = [], premiumOnly = false, signal, onProgress } = {}) {
  const originData = origin || (await parseReservationOrigin(resId));
  const session = {
    resId, origin: originData,
    originResourceType: originData.resourceType, originResourceTier: originData.resourceTier,
    originIsPremiumTier: false,
    discovered: new Map(), resourcesChecked: new Set(), rawResources: [],
    frontier: [], retryQueue: [], retryCount: new Map(), permanentlyFailed: [],
    waveCount: 0, hasMore: true,
    aborted: false, // "탐색 종료" 버튼을 누르면 dispatch_system_driver.js가 이 값을 true로 세팅
  };
  session.discovered.set(originData.regionId, { ...originData, distKm: 0 });
  const { searchRegions } = await discoverFromCenter(originData.regionId, session.discovered, originData.lat, originData.lng, signal);
  session.frontier = searchRegions;

  const firstBatch = await Promise.all(searchRegions.map((rid) => fetchResourcesForRegion(rid, originData.startAt, originData.endAt, signal)));
  firstBatch.forEach((resources, i) => {
    const z = session.discovered.get(searchRegions[i]);
    session.resourcesChecked.add(searchRegions[i]);
    session.rawResources.push(...filterCandidateResources(resources, { startAt: originData.startAt, endAt: originData.endAt, originIsPremiumTier: session.originIsPremiumTier, distKm: z.distKm, address: z.address }));
  });

  onProgress?.({
    stage: 'initial', matchingCount: countMatching(session.rawResources, selectedCategories, null, session, premiumOnly),
    results: applyFilter(session, selectedCategories, null, premiumOnly),
  });

  await expandSearch(session, { selectedCategories, minResults: DEFAULT_MIN_RESULTS, premiumOnly, signal, onProgress });
  return session;
}

// ── 웨이브 기반 확장 검색 — frontier(다음에 조사할 region들)를 소진할 때까지
//    반복. 개별 region 조회 실패는 MAX_RETRY까지 재시도하고, 그래도 실패하면
//    permanentlyFailed에 기록만 하고 계속 진행한다(전체 검색을 막지 않는다).
//    session.aborted는 즉시 루프를 빠져나오는 트리거 — "중단" 버튼은 지금까지
//    찾은 결과를 버리지 않고 그대로 반환하기 위해 세대(generation)를 넘기지
//    않는다(호출부인 dispatch_system_driver.js 책임). ──
async function expandSearch(session, { selectedCategories = [], minResults = DEFAULT_MIN_RESULTS, resourceTypeFilter = null, premiumOnly = false, isExpansion = false, onProgress, signal } = {}) {
  const countBefore = countMatching(session.rawResources, selectedCategories, resourceTypeFilter, session, premiumOnly);
  const target = isExpansion ? countBefore + minResults : minResults;
  let satisfied = false;

  while ((session.frontier.length > 0 || session.retryQueue.length > 0) && !satisfied && !session.aborted) {
    const currentFrontier = session.frontier;
    session.frontier = [];
    const toQuery = [...currentFrontier.filter((rid) => !session.resourcesChecked.has(rid)), ...session.retryQueue];
    session.retryQueue = [];

    const results = await Promise.allSettled(toQuery.map((rid) => fetchResourcesForRegion(rid, session.origin.startAt, session.origin.endAt, signal)));
    results.forEach((r, i) => {
      const rid = toQuery[i];
      const z = session.discovered.get(rid);
      if (r.status === 'fulfilled') {
        session.resourcesChecked.add(rid);
        session.rawResources.push(...filterCandidateResources(r.value, { startAt: session.origin.startAt, endAt: session.origin.endAt, originIsPremiumTier: session.originIsPremiumTier, distKm: z.distKm, address: z.address }));
      } else {
        const count = (session.retryCount.get(rid) || 0) + 1;
        session.retryCount.set(rid, count);
        if (count <= MAX_RETRY) session.retryQueue.push(rid);
        else session.permanentlyFailed.push(rid); // 재시도 소진 — 포기, 화면에 표시용으로만 기록
      }
    });

    session.waveCount += 1;
    onProgress?.({
      stage: 'batch', wave: session.waveCount,
      matchingCount: countMatching(session.rawResources, selectedCategories, resourceTypeFilter, session, premiumOnly),
      results: applyFilter(session, selectedCategories, resourceTypeFilter, premiumOnly),
    });
    if (countMatching(session.rawResources, selectedCategories, resourceTypeFilter, session, premiumOnly) >= target) satisfied = true;
    if (session.aborted) break;

    // 부족하면 반경을 한 단계 더 넓혀 새 중심점들로부터 다시 이웃을 탐색
    if (!satisfied) {
      const centers = [...session.discovered.values()].filter((z) => z.distKm < RADIUS_STEPS_KM[Math.min(session.waveCount, RADIUS_STEPS_KM.length - 1)]);
      for (const center of centers) {
        if (session.aborted) break;
        const { searchRegions } = await discoverFromCenter(center.regionId, session.discovered, session.origin.lat, session.origin.lng, signal);
        session.frontier.push(...searchRegions);
      }
    }
  }
  session.hasMore = session.frontier.length > 0 || session.retryQueue.length > 0;
}

function applyFilter(session, selectedCategories, resourceTypeFilter, premiumOnly) {
  let list;
  if (resourceTypeFilter) list = session.rawResources.filter((r) => r.resourceType.includes(resourceTypeFilter));
  else if (selectedCategories?.length) list = tieredMatchesForSelection(session.rawResources, session.originResourceType, selectedCategories).list;
  else list = tieredMatches(session.rawResources, session.originResourceType, session.originResourceTier).list;
  if (premiumOnly) list = list.filter(isPremiumTier);
  return list.sort((a, b) => a.distKm - b.distKm);
}

// ── 세션 스냅샷 저장/복원 — 탭 재로드·서비스워커 재시작에도 지금까지 찾은
//    결과를 잃지 않도록 storage에 직렬화해둔다(Map/Set은 배열로 변환). ──
function serializeSession(session) {
  return {
    ...session,
    discovered: [...session.discovered.entries()],
    resourcesChecked: [...session.resourcesChecked],
    retryCount: [...session.retryCount.entries()],
  };
}
function deserializeSession(raw) {
  if (!raw) return null;
  return {
    ...raw,
    discovered: new Map(raw.discovered),
    resourcesChecked: new Set(raw.resourcesChecked),
    retryCount: new Map(raw.retryCount),
  };
}

window.CandidateSearch = {
  haversineKm, computeBearing, startSearch, expandSearch, applyFilter,
  parseReservationOrigin, serializeSession, deserializeSession,
};

// dispatch_system_driver.js
// [MOCK] 예약·배차 시스템 콘텐츠 스크립트 — 서비스워커가 릴레이한
// DO_* 명령을 받아 예약블록(일정 점유) 생성, 후보 리소스 검색 오케스트레이션,
// 수기배정, 고객예약변경을 수행한다. 이 파일 자체는 헤드리스 API 호출 위주(폼
// 자동채움이 아니라 내부 API를 직접 fetch하는 방식)이고, 좌표 스코어링은
// candidate_search.js, 표 파싱은 dom_parser.js에 위임한다.

let RPA_MSG_TOKEN = sessionStorage.getItem('SPOG_MSG_TOKEN');
if (!RPA_MSG_TOKEN) { RPA_MSG_TOKEN = crypto.randomUUID(); sessionStorage.setItem('SPOG_MSG_TOKEN', RPA_MSG_TOKEN); }
(() => {
  const spy = document.createElement('script');
  spy.src = chrome.runtime.getURL('js/dispatch_system_interceptor.js');
  spy.onload = () => spy.remove();
  (document.head || document.documentElement).appendChild(spy);
})();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function sendStatus(text, tone) { chrome.runtime.sendMessage({ type: 'RPA_CENTRAL_LOG', text, tone }).catch(() => {}); }

// 세션(sessionStorage) 헬퍼 — 탭 재로드 시에도 진행 중이던 흐름을 이어가기 위함
const sessionSet = (obj) => chrome.storage.session.set(obj);
const sessionGet = (keys) => chrome.storage.session.get(keys);
const sessionRemove = (keys) => chrome.storage.session.remove(keys);

// =========================================================================
// 헤드리스 예약블록 생성 — 폼을 채우는 대신 내부 API를 직접 호출한다(더 빠르고,
// 화면 레이아웃 변경에도 덜 취약함). 예약번호 또는 리소스ID 둘 중 하나로 시작 가능.
// =========================================================================
async function executeHeadlessReservationBlock(resId, options = {}) {
  sendStatus(`예약번호 ${resId} 기준 예약블록 생성 중...`, 'info');
  try {
    const origin = await CandidateSearch.parseReservationOrigin(resId);
    const { blockStart, blockEnd } = DomParser.calculateBlockTime(origin.startAt, origin.endAt, options);
    await sendReservationBlockApi({ resId, resourceId: origin.resourceId, blockStart, blockEnd });
    sendStatus(`예약블록 생성 완료 (리소스 ${origin.resourceId})`, 'success');
    return { success: true, resourceId: origin.resourceId };
  } catch (e) {
    sendStatus(`예약블록 생성 실패: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
}
async function executeHeadlessReservationBlockByResourceId(resourceId, startAt, endAt, options = {}) {
  const { blockStart, blockEnd } = DomParser.calculateBlockTime(startAt, endAt, options);
  await sendReservationBlockApi({ resourceId, blockStart, blockEnd });
}
async function sendReservationBlockApi({ resId, resourceId, blockStart, blockEnd }) {
  const res = await fetch('/api/dispatch/reservation-block', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resId, resourceId, blockStart, blockEnd }),
  });
  if (!res.ok) throw new Error(`예약블록 API 실패 (${res.status})`);
  return res.json();
}

// =========================================================================
// 후보 리소스 검색 — 세대(generation) + AbortController 기반 stale 응답 가드.
//   - "새로 검색"(reset)  : 세대를 올리고 이전 요청을 실제로 abort() — 서버/
//     네트워크 자원까지 확실히 정리한다.
//   - "이어서 계속"(expand): 세대만 유지한 채(진행 중인 요청과 이어지는 작업이므로)
//     계속 진행한다.
//   - "중단"(stop)        : 세대는 그대로 두고 session.aborted 플래그만 세팅 —
//     지금까지 찾은 결과는 버리지 않고 같은 세대로 정상 보고된다.
// 요청이 늦게 도착했을 때(예: 사용자가 이미 새 검색을 눌러버린 경우) 화면이
// 예전 상태로 되돌아가는 렉을 막기 위해, 콜백/최종 보고 직전에 항상 "지금도
// 여전히 최신 세대인가"를 재확인한다.
// =========================================================================
const _generation = new Map();      // resId -> 현재 세대 번호
const _abortControllers = new Map(); // resId -> AbortController
const _sessions = new Map();         // resId -> 검색 세션(메모리)
const _originCache = new Map();      // resId -> 기준 좌표/리소스 유형 (재조회 방지)

function _nextGenReplace(key) {
  const gen = (_generation.get(key) || 0) + 1;
  _generation.set(key, gen);
  _abortControllers.get(key)?.abort(); // 이전 요청은 진짜로 취소
  const controller = new AbortController();
  _abortControllers.set(key, controller);
  return { gen, signal: controller.signal };
}
function _nextGenContinue(key) {
  const gen = (_generation.get(key) || 0) + 1;
  _generation.set(key, gen);
  let controller = _abortControllers.get(key);
  if (!controller || controller.signal.aborted) { controller = new AbortController(); _abortControllers.set(key, controller); }
  return { gen, signal: controller.signal };
}

function _storageKey(resId) { return `candidate_session_${resId}`; }
async function _persistSession(resId, session) {
  await sessionSet({ [_storageKey(resId)]: CandidateSearch.serializeSession(session) }).catch(() => {});
}
async function _getSession(resId) {
  const key = _storageKey(resId);
  let session = _sessions.get(String(resId));
  if (session) return session;
  const stored = await sessionGet([key]);
  const restored = CandidateSearch.deserializeSession(stored?.[key]);
  if (restored) _sessions.set(String(resId), restored);
  return restored || null;
}
function _reportProgress(resId, progress) { chrome.runtime.sendMessage({ type: 'CANDIDATE_SEARCH_PROGRESS', resId, progress }).catch(() => {}); }
function _reportResult(resId, session, selectedCategories, resourceTypeFilter, premiumOnly) {
  chrome.runtime.sendMessage({
    type: 'CANDIDATE_SEARCH_RESULT', resId, origin: session.origin,
    results: CandidateSearch.applyFilter(session, selectedCategories, resourceTypeFilter, premiumOnly),
    hasMore: session.hasMore, rawResourceCount: session.rawResources.length,
    permanentlyFailedCount: (session.permanentlyFailed || []).length,
  }).catch(() => {});
}

async function handleCandidateSearchStart(resId, selectedCategories, premiumOnly = false) {
  const key = String(resId);
  const { gen: myGen, signal } = _nextGenReplace(key);
  sendStatus(`예약번호 ${resId} 기준 후보 리소스 검색 중...`, 'info');
  try {
    const cachedOrigin = _originCache.get(key);
    const session = await CandidateSearch.startSearch(resId, {
      origin: cachedOrigin, selectedCategories, premiumOnly, signal,
      onProgress: (p) => { if (_generation.get(key) !== myGen) return; _reportProgress(resId, p); },
    });
    if (_generation.get(key) !== myGen) return; // 결과 보고 직전 최종 재확인
    _sessions.set(key, session);
    await _persistSession(resId, session);
    _reportResult(resId, session, selectedCategories, null, premiumOnly);
    sendStatus(`검색 완료 (raw ${session.rawResources.length}건 발견)`, 'success');
  } catch (e) {
    if (_generation.get(key) !== myGen) return; // abort로 인한 에러도 낡은 세대면 조용히 무시
    sendStatus(`검색 실패: ${e.message}`, 'error');
    chrome.runtime.sendMessage({ type: 'CANDIDATE_SEARCH_ERROR', resId, error: e.message }).catch(() => {});
  }
}
async function handleCandidateSearchReset(resId) {
  const key = String(resId);
  _nextGenReplace(key); // 이전 요청 즉시 취소
  _sessions.delete(key);
  _originCache.delete(key);
  _abortControllers.delete(key); // 다 쓴 컨트롤러 정리 — 안 하면 resId별로 계속 누적되는 누수가 생긴다
  await sessionRemove([_storageKey(resId)]);
}
async function handleCandidateSearchStop(resId) {
  const session = await _getSession(resId);
  if (session) session.aborted = true; // 세대는 그대로 — 지금까지의 결과를 정상 보고
  else chrome.runtime.sendMessage({ type: 'CANDIDATE_SEARCH_ERROR', resId, error: '중단할 진행 중인 탐색이 없습니다.' }).catch(() => {});
}
async function handleCandidateSearchExpand(resId, selectedCategories, resourceTypeFilter, premiumOnly = false) {
  const key = String(resId);
  const { signal } = _nextGenContinue(key); // "이어서 계속" — 세션/컨트롤러는 건드리지 않음
  const session = await _getSession(resId);
  if (!session) return chrome.runtime.sendMessage({ type: 'CANDIDATE_SEARCH_ERROR', resId, error: '검색 세션이 없습니다. 다시 검색해주세요.' }).catch(() => {});
  await CandidateSearch.expandSearch(session, {
    selectedCategories, resourceTypeFilter, premiumOnly, isExpansion: true, signal,
    onProgress: (p) => _reportProgress(resId, p),
  });
  await _persistSession(resId, session);
  _reportResult(resId, session, selectedCategories, resourceTypeFilter, premiumOnly);
}

// =========================================================================
// 명령 라우팅 — service_worker.ts가 REQ_*를 DO_*로 변환해 보낸 것을 받는다
// =========================================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'DO_CANDIDATE_SEARCH_START': handleCandidateSearchStart(msg.resId, msg.selectedCategories, msg.premiumOnly); break;
    case 'DO_CANDIDATE_SEARCH_RESET': handleCandidateSearchReset(msg.resId); break;
    case 'DO_CANDIDATE_SEARCH_STOP': handleCandidateSearchStop(msg.resId); break;
    case 'DO_CANDIDATE_SEARCH_EXPAND': handleCandidateSearchExpand(msg.resId, msg.selectedCategories, msg.resourceTypeFilter, msg.premiumOnly); break;
    case 'DO_CREATE_RESERVATION_BLOCK': executeHeadlessReservationBlock(msg.resId).then((r) => chrome.runtime.sendMessage({ type: 'RESERVATION_BLOCK_CREATED', resId: msg.resId, ...r })); break;
  }
  return false;
});

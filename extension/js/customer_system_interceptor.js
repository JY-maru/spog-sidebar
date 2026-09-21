// customer_system_interceptor.js
// [MOCK] 고객 응대 시스템 페이지 메인 월드 스파이. 회원 검색/상세조회
// API를 가로채 customer_system_driver.js로 전달한다. 핵심은 "중복 연락처(동일 전화번호로
// 여러 회원이 검색되는 경우)" 처리 — 임의로 첫 번째 결과를 확정하지 않고
// 후보만 캐싱해둔 뒤, 상담원이 실제로 특정 회원의 상세 정보를 펼쳐보는 API
// 호출이 발생하는 시점을 "사용자가 지정한 회원"으로 간주해 그때 확정한다.

const RPA_MSG_TOKEN = sessionStorage.getItem('SPOG_MSG_TOKEN');
function _post(target, data) { target.postMessage({ ...data, __spogToken: RPA_MSG_TOKEN }, '*'); }
function _log(...args) { console.log('[SPoG:InjectD]', ...args); }

// 콜백 상담 iframe 안에서 검색/확정이 일어나는 경우도 있어, 후보 캐시를
// 프레임 로컬이 아니라 window.top에 공유로 둔다(cross-origin으로 막히면
// 프레임 로컬로 폴백).
function _getMemberCandidateStore() {
  try {
    if (!window.top._SPOG_MEMBER_CANDIDATES) window.top._SPOG_MEMBER_CANDIDATES = {};
    return window.top._SPOG_MEMBER_CANDIDATES;
  } catch (e) {
    if (!window._SPOG_MEMBER_CANDIDATES_LOCAL) window._SPOG_MEMBER_CANDIDATES_LOCAL = {};
    return window._SPOG_MEMBER_CANDIDATES_LOCAL;
  }
}
function _isCallbackContext() {
  return window.name === 'callback_iframe' || window.location.href.includes('callback_consult');
}

function processMemberSearchResult(data, isCallbackFrame) {
  const store = _getMemberCandidateStore();
  if (data.length > 1) {
    // 중복 발견 — [0]번 임의 확정 금지, 후보만 캐싱하고 "지정" 신호를 기다린다.
    for (const k in store) delete store[k];
    data.forEach((m) => { if (m?.id) store[m.id] = m; });
    _log(`중복 연락처 감지 (${data.length}건) — 사용자 지정 대기 중`);
  } else if (data.length === 1) {
    for (const k in store) delete store[k];
    _post(window.top, { type: 'MEMBER_API_INTERCEPTED', payload: data[0], isCallbackFrame });
  }
}
function processMemberDetailView(memberId) {
  const store = _getMemberCandidateStore();
  const picked = memberId && store[memberId];
  if (picked) {
    _log(`중복 연락처 중 사용자 지정 회원 확정: ${picked.name} (id:${memberId})`);
    _post(window.top, { type: 'MEMBER_API_INTERCEPTED', payload: picked, isCallbackFrame: _isCallbackContext() });
  }
}

// ── fetch 몽키패치 — 회원 검색/상세조회 API만 가로챈다 ──
const _origFetch = window.fetch;
window.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : input.url;
  const res = await _origFetch.apply(this, arguments);
  try {
    if (url.includes('/api/member/search')) {
      res.clone().json().then((body) => processMemberSearchResult(body.data || [], _isCallbackContext())).catch(() => {});
    }
    if (url.includes('/api/member/detail')) {
      const memberId = new URL(url, location.origin).searchParams.get('memberId');
      processMemberDetailView(parseInt(memberId, 10));
    }
  } catch (e) { console.error('[SPoG:InjectD] API 인터셉트 처리 실패:', e); }
  return res;
};

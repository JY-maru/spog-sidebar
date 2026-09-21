// case_system_interceptor.js
// [MOCK] 케이스 관리 시스템 페이지의 메인 월드에 동적 주입되는 스파이
// 스크립트. 콘텐츠 스크립트는 격리된 월드에서 실행되어 페이지의 fetch/XHR
// 호출을 직접 가로챌 수 없으므로, 이 스크립트가 페이지 컨텍스트에서
// fetch/XHR을 몽키패치해 필요한 API 응답만 골라 postMessage로 case_system_driver.js에
// 전달한다. 토큰(__spogToken)은 case_system_driver.js가 세션당 1회 발급한 값을 그대로
// 붙여보내 위조 메시지를 막는다.

const RPA_MSG_TOKEN = sessionStorage.getItem('SPOG_MSG_TOKEN');
function _post(target, data) { target.postMessage({ ...data, __spogToken: RPA_MSG_TOKEN }, '*'); }
function _log(...args) { console.log('[SPoG:InjectB]', ...args); }

// ── 상담사(로그인 사용자) 정보 — 로그인 직후 세션 API 응답에서 1회 추출 ──
async function fetchAndSendUserInfo() {
  try {
    const res = await fetch('/api/session/me');
    const data = await res.json();
    _post(window, { type: 'INTERCEPTED_AGENT_INFO', payload: { managerName: data.name, loginId: data.loginId } });
  } catch (e) { console.error('[SPoG:InjectB] 세션 정보 조회 실패:', e); }
}

// ── 사고카드 상세 API 응답에서 필요한 필드만 추출 ──
// 응답 구조 예: { case: { reservation: { reservationId }, insurerReceipt }, caseResource: { resourceNumber }, coverages: [...] }
function _extractCaseFields(data) {
  const insNumber = data?.case?.insurerReceipt?.insurerReceiptNumber || '';
  const hasEmgCoverage = Array.isArray(data.coverages) && data.coverages.some((c) => c.name?.includes('현장출동'));
  const apiCaseId = data?.case?.reservation?.reservationId || '';
  const apiResourceId = data?.caseResource?.resourceNumber || '';
  const isPlan = data?.action?.resource?.usageType === 'SUBSCRIPTION' || data?.case?.reservation?.memberFlag === 'SUBSCRIPTION_HOLD';
  return { insNumber, needsEmgWrecker: hasEmgCoverage, apiCaseId, apiResourceId, isPlan };
}

// ── 상담이력 저장(consult) 요청 바디에서 회원번호/예약번호/차량번호/이력내용을
//    바로 판단해 전송 — 응답을 기다릴 필요 없이 요청이 잡히는 시점에 처리한다. ──
function _handleCreateConsultRequest(body) {
  try {
    const bodyStr = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    if (!bodyStr) return;
    const params = new URLSearchParams(bodyStr);
    const memberNo = (params.get('member_no') || '').trim();
    const resNo = (params.get('res_no') || '').trim();
    const carNo = (params.get('car_no') || '').trim();
    const content = params.get('content') || '';
    if (!memberNo && !resNo) return;

    const parsedFields = window.TextParser?.parseIntakeTemplate(content) || null;
    _post(window, { type: 'CONSULT_HISTORY_SAVED', payload: { memberNo, resNo, carNo, content, parsedFields } });
  } catch (e) { console.error('[SPoG:InjectB] 상담이력 요청 파싱 실패:', e); }
}

// ── fetch/XHR 몽키패치 — 케이스 상세 조회 API만 골라서 가로챈다 ──
const _origFetch = window.fetch;
window.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : input.url;
  const res = await _origFetch.apply(this, arguments);
  if (url.includes('/api/case/detail')) {
    res.clone().json().then((data) => _post(window, { type: 'INTERCEPTED_CASE', payload: _extractCaseFields(data) })).catch(() => {});
  }
  if (url.includes('/api/consult/create') && init?.body) {
    _handleCreateConsultRequest(init.body);
  }
  return res;
};

fetchAndSendUserInfo();

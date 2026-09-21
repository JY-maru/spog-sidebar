// customer_system_driver.js
// [MOCK] 고객 응대 시스템 콘텐츠 스크립트 — 인바운드 콜백 신호 중계,
// 회원정보 선캐싱 + 화면 표시값과의 교차검증, 예약 클릭 시 리소스/보험 정보
// 조회 후 사이드바로 전달한다. 모든 iframe에서 실행되므로(all_frames) 콜백
// 상담 iframe 안에서 일어나는 인입도 함께 처리한다.

const isTopWindow = window.self === window.top;
const isMainPage = window.location.href.includes('/consult/main');

let RPA_MSG_TOKEN = sessionStorage.getItem('SPOG_MSG_TOKEN');
if (!RPA_MSG_TOKEN) { RPA_MSG_TOKEN = crypto.randomUUID(); sessionStorage.setItem('SPOG_MSG_TOKEN', RPA_MSG_TOKEN); }
try {
  const spy = document.createElement('script');
  spy.src = chrome.runtime.getURL('js/customer_system_interceptor.js');
  spy.onload = () => spy.remove();
  (document.head || document.documentElement).appendChild(spy);
} catch (e) { console.warn('[SPoG:CustomerD] 스파이 주입 준비 중...'); }

// ── 알람/콜백 카운트 신호 중계 (사운드/UI는 사이드바로 완전 이관됨) ──
if (isTopWindow) {
  window.addEventListener('message', (e) => {
    // 이 페이지 자신에게서 온 신호만 인정 — 다른 출처(예: 페이지 내 서드파티
    // iframe)에서 위조된 메시지는 여기서 걸러진다.
    if (e.origin !== window.location.origin) return;
    if (e.data?.__spogToken !== RPA_MSG_TOKEN) return;
    if (e.data?.type === 'INTERCEPTED_AGENT_INFO') {
      chrome.runtime.sendMessage({ type: 'INTERCEPTED_AGENT_INFO', ...e.data.payload }).catch(() => {});
    }
  });
}
if (isTopWindow && isMainPage) {
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.__spogToken !== RPA_MSG_TOKEN) return;
    if (e.data?.type === 'INBOUND_CALLBACK_COUNT_UPDATE') {
      chrome.runtime.sendMessage({ type: 'INBOUND_CALLBACK_COUNT_UPDATE', count: e.data.count || 0 }).catch(() => {});
    }
  });
}

// ── 회원정보 캐시 + 사이드바 연동 (팝업창 포함 모든 top window 공통) ──
if (isTopWindow) {
  window.customerMemberCache = null;

  window.addEventListener('message', async (e) => {
    if (e.origin !== window.location.origin) return; // 가장 민감한 지점 — 고객 이름/전화/회원ID를 다루므로 오리진 검증 필수
    if (e.data?.__spogToken !== RPA_MSG_TOKEN) return;

    if (e.data?.type === 'MEMBER_API_INTERCEPTED') {
      // 새 고객 인입 신호가 오면 캐시부터 즉시 비운다 — 이전 고객 정보가 짧은
      // 간극 동안 그대로 딸려나가는(캐시 오염) 사고를 막기 위해 파싱보다 먼저 실행.
      window.customerMemberCache = null;
      const p = e.data.payload;

      window.customerMemberCache = {
        name: p.name || '', phone: p.phone || '', memberId: p.id || null,
        planType: resolvePlanType(p), cachedAt: Date.now(),
      };

      // 1차 검증 — 화면에 표시된 회원번호와 API로 받은 회원ID가 일치하는지 대조.
      // 콜백 프레임에서 온 신호는 최상위 문서의 폼 필드와 무관하므로 이 대조를 건너뛴다.
      const isCallbackFrame = e.data.isCallbackFrame === true;
      const screenId = isCallbackFrame ? '' : (document.getElementById('member-no')?.value?.trim() || '');
      const apiId = String(window.customerMemberCache.memberId || '');
      if (screenId && apiId && screenId !== apiId) {
        console.warn(`[SPoG:CustomerD] 회원정보 불일치 - 화면(${screenId}) vs API(${apiId})`);
        window.customerMemberCache = null; // 신뢰 못 하는 정보는 캐시에 남기지 않는다
        return; // 사이드바로도 전달하지 않는다
      }

      chrome.runtime.sendMessage({ type: 'INBOUND_CALLBACK_ARRIVED', name: window.customerMemberCache.name, memberId: window.customerMemberCache.memberId }).catch(() => {});
    }

    if (e.data?.type === 'RESERVATION_CLICKED_IN_FRAME') {
      const { resourceIdRaw, resId, isCallbackFrame } = e.data.payload;
      // 2차 시점에는 1차(회원 인입)에서 이미 검증이 끝났으므로 캐시 존재 여부만 확인한다 —
      // 존재한다는 것 자체가 이미 "화면 회원번호와 일치 확인됨"이라는 뜻이다.
      const cached = window.customerMemberCache;
      if (!cached) console.warn('[SPoG:CustomerD] 예약 클릭 시점에 검증된 회원 캐시가 없음');

      let resourceFullString = resourceIdRaw;
      let insurance = '확인불가';
      try {
        const res = await fetch(`/api/resource/lookup?resourceId=${encodeURIComponent(resourceIdRaw)}`);
        const data = await res.json();
        if (data?.resourceType) resourceFullString = `${resourceIdRaw} ${data.resourceType}`.trim();
        if (data?.insurer) insurance = normalizeInsurerName(data.insurer);
      } catch (err) { console.error('[SPoG:CustomerD] 리소스 정보 조회 실패:', err); }

      chrome.runtime.sendMessage({
        type: 'SEND_CASE_TO_PORTAL',
        data: { resId, resourceId: resourceFullString, name: cached?.name || '알수없음', phone: cached?.phone || '알수없음', insCompany: insurance, isCallbackFrame },
      }).catch(() => {});
    }
  });
}

function resolvePlanType(p) {
  const sub = p.subscription?.[0];
  if (!sub) return '';
  if (sub.type === 'BUSINESS') return '비즈니스플랜';
  if (sub.type === 'PLAN') return '구독';
  return '';
}
function normalizeInsurerName(raw) {
  if (raw.includes('하나')) return '하나';
  if (raw.includes('삼성')) return '삼성화재';
  if (raw.toUpperCase().includes('AXA')) return '악사';
  return raw;
}

// ── 프레임 클릭 감지기 — 콜백 상담 iframe을 포함한 모든 iframe에서 동작 ──
document.addEventListener('click', (e) => {
  const target = e.target.closest('a[data-action="open-reservation"]');
  if (!target) return;
  const resourceIdRaw = target.dataset.resourceId;
  const resId = target.dataset.resId;
  const isCallbackFrame = window.name === 'callback_iframe';
  window.top.postMessage({ type: 'RESERVATION_CLICKED_IN_FRAME', payload: { resourceIdRaw, resId, isCallbackFrame }, __spogToken: RPA_MSG_TOKEN }, '*');
}, true);

// ── 대기큐 제어 브릿지 (사이드바 ↔ 메인월드) ──
window.addEventListener('message', (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.__spogToken !== RPA_MSG_TOKEN) return;
  if (['QUEUE_INIT_STATE', 'QUEUE_TOGGLE_RESULT', 'QUEUE_STATUS_UPDATE'].includes(e.data?.type)) {
    chrome.runtime.sendMessage(e.data);
  }
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'FORWARD_TOGGLE_QUEUE') window.postMessage({ type: 'REQ_TOGGLE_QUEUE', payload: { queueId: msg.queueId, joined: msg.joined }, __spogToken: RPA_MSG_TOKEN }, '*');
  if (msg.type === 'FORWARD_QUEUE_STATE_REFRESH') window.postMessage({ type: 'REQ_QUEUE_STATE_REFRESH', __spogToken: RPA_MSG_TOKEN }, '*');
});

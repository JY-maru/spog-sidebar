// dispatch_system_interceptor.js
// [MOCK] 예약·배차 시스템 페이지 메인 월드 스파이. 이 시스템 고유의
// 책임은 "대기큐(작업 배정 큐) 제어" — 페이지에 있는 큐 참여 스위치를 사이드바
// 에서 원격으로 켜고 끌 수 있게 중계하고, 상태가 바뀔 때마다 주기적으로
// 새로고침해 사이드바 표시를 최신으로 유지한다.

const RPA_MSG_TOKEN = sessionStorage.getItem('SPOG_MSG_TOKEN');
function _post(target, data) { target.postMessage({ ...data, __spogToken: RPA_MSG_TOKEN }, '*'); }

let _queueRefreshTimer = null;
let _queueEnforceEnabled = true;

// ── 큐 컨트롤러 초기화 — 페이지의 큐 위젯 DOM/API를 찾아 초기 상태를 사이드바로 보고 ──
function initQueueController() {
  refreshQueueStatusNow();
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.__spogToken !== RPA_MSG_TOKEN) return;
    if (e.data.type === 'REQ_TOGGLE_QUEUE') _toggleQueue(e.data.payload.queueId, e.data.payload.joined);
    if (e.data.type === 'REQ_QUEUE_STATE_REFRESH') refreshQueueStatusNow();
    if (e.data.type === 'REQ_QUEUE_STATUS_REFRESH') refreshQueueStatusNow();
  });
}

async function _toggleQueue(queueId, joined) {
  try {
    const res = await fetch(`/api/queue/${queueId}/${joined ? 'join' : 'leave'}`, { method: 'POST' });
    const ok = res.ok;
    _post(window, { type: 'QUEUE_TOGGLE_RESULT', queueId, joined: ok ? joined : !joined, success: ok });
  } catch (e) {
    _post(window, { type: 'QUEUE_TOGGLE_RESULT', queueId, joined: !joined, success: false, error: e.message });
  }
}

async function refreshQueueStatusNow() {
  try {
    const res = await fetch('/api/queue/status');
    const data = await res.json();
    _post(window, { type: 'QUEUE_STATUS_UPDATE', queues: data.queues, waitingCount: data.waitingCount });
  } catch (e) { console.error('[SPoG:InjectC] 큐 상태 조회 실패:', e); }
}
function scheduleQueueStatusRefresh(intervalMs = 30000) {
  if (_queueRefreshTimer) clearInterval(_queueRefreshTimer);
  _queueRefreshTimer = setInterval(refreshQueueStatusNow, intervalMs);
}

// [정책] 설정에서 "자동 참여 강제"가 켜져 있으면, 사용자가 실수로 큐에서
// 빠져나가도 주기적으로 다시 참여 상태로 되돌린다 — 배차 누락을 막기 위한
// 조직 정책성 로직이므로 사이드바 설정 패널의 스위치로 on/off 가능하다.
function _enforceAutoOn(queueId) {
  if (!_queueEnforceEnabled) return;
  fetch(`/api/queue/${queueId}/status`).then((r) => r.json()).then((s) => {
    if (!s.joined) _toggleQueue(queueId, true);
  }).catch(() => {});
}

// 페이지 자체의 상태 변경 이벤트(예: 배차 완료 알림)를 관찰해 큐 상태를
// 그때그때 갱신 — 폴링 간격보다 더 즉각적인 반영이 필요한 이벤트용.
function hookAnalyticsObservations() {
  const observer = new MutationObserver(() => refreshQueueStatusNow());
  const target = document.querySelector('[data-queue-widget]');
  if (target) observer.observe(target, { childList: true, subtree: true });
}

function startQueueStatusMonitoring() {
  initQueueController();
  hookAnalyticsObservations();
  scheduleQueueStatusRefresh();
}

startQueueStatusMonitoring();

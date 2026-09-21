// ui_controller.js
// [MOCK] 포털 사이드바 코어 — 패널 전환(강제 인터럽트 vs 앰비언트
// 뱃지), 상태바/토스트, 보안 타이머, MV3 서비스워커 재시작 복구를 담당한다.
// 패널 "내용"은 이 파일이 그리지 않는다 — js/panels/*.tsx(React 컴포넌트)를
// 마운트만 하고, 실제 원본에서도 이 파일은 React로 이전되지 않은 순수 JS
// 셸이다: 테마/프로필/보안타이머 같은 셸 전역 관심사를 여전히 이 파일이
// 직접 처리하고, window.StateManager(레거시 파사드)도 계속 무수정으로 호출한다.
// 패널 쪽 React 컴포넌트가 셸 기능이 필요할 때 되불러 쓰도록 updateStatus/
// showToast/switchPanel 같은 걸 window.UiController로 공개 API처럼 노출한다 —
// 이 파일은 처음부터 끝까지 한 번에 새로 짜인 게 아니라, 패널을 하나씩
// React로 옮겨가는 점진적 마이그레이션 동안 계속 남아있는 레거시 셸이다.

let _securityTimer = null;

function updateStatus(text, tone = 'info') {
  const t = RPA_APP_CONFIG.TONE[tone] || RPA_APP_CONFIG.TONE.info;
  document.getElementById('spog-status-text').textContent = `${t.icon} ${text}`;
}

function showToast(text, tone = 'info') {
  Panels.toastActions.push(text, tone); // 5초 후 자동 소멸
}

// [핵심] 확장프로그램 업데이트 직후 "아직 새로고침 안 된 시스템 탭" 안내처럼,
// 자동으로 사라지면 안 되고 호출자가 직접 갱신/해제하는 토스트. 같은 id로
// 다시 부르면 텍스트/톤만 교체(중복 방지) — service_worker.ts가 새로고침
// 감지될 때마다 이 id로 계속 갱신하다가 다 끝나면 dismiss한다.
function showPersistentToast(id, text, tone = 'info') {
  Panels.toastActions.upsertPersistent(id, text, tone);
}
function dismissToast(id) {
  Panels.toastActions.dismiss(id);
}

function startSecurityTimer() {
  clearSecurityTimer();
  // 케이스 연결 상태를 방치하면 다음 상담원이 이전 고객 정보를 그대로 보게 될
  // 위험이 있어, 일정 시간 후 자동으로 연결 해제 + 경고를 띄운다.
  _securityTimer = setTimeout(() => {
    StateManager.resetCaseInfo();
    Panels.caseActions.setDisconnected();
    showToast('일정 시간 입력이 없어 케이스 연결이 자동 해제되었습니다.', 'warning');
  }, RPA_APP_CONFIG.TIMEOUT.SECURITY_LOCK ?? 30000);
}
function clearSecurityTimer() {
  if (_securityTimer) { clearTimeout(_securityTimer); _securityTimer = null; }
}

// =========================================================================
// 패널 전환 — 인터럽트(강제 전환) vs 앰비언트(뱃지만)
//   핵심 이벤트(케이스 카드 생성/연결)는 지금 사용자가 뭘 보고 있든 강제로
//   패널을 바꿔서 즉시 확인시킨다. 부차적 이벤트(인바운드 콜백 건수 갱신처럼
//   "정보가 갱신됐다"는 사실만 알리면 되는 것)는 패널을 바꾸지 않고 뱃지만
//   올려 사용자의 현재 작업 흐름을 방해하지 않는다.
// =========================================================================
const PANEL_IDS = ['panel-inbound', 'panel-case', 'panel-dispatch', 'panel-postcare', 'panel-settings'];

function switchPanel(panelId, { forced = false } = {}) {
  if (!PANEL_IDS.includes(panelId)) return;
  Panels.setActivePanel(panelId); // React 셸 컴포넌트(Shell)의 state를 갱신 — 실제 DOM 스위칭은 React가 담당
  if (forced) Panels.flashNavItem(panelId); // 강제 전환임을 시각적으로 강조
}

// 인터럽트 예시 — 새 케이스 카드 연결 (message_router.ts가 검증 통과 후 호출)
function onCaseConnected() {
  switchPanel('panel-case', { forced: true });
}

// 앰비언트 예시 — 인바운드 콜백 건수만 갱신, 패널 전환은 하지 않는다
function onInboundCountUpdated(count) {
  Panels.inboundActions.setBadgeCount(count); // 아이콘 레일에 숫자 뱃지만 표시
}

// =========================================================================
// MV3 서비스워커 재시작 복구
//   서비스워커는 예고 없이 유휴 종료→재기동될 수 있다. 재기동 직후에는
//   서비스워커 메모리에 있던 상태(로그인 식별자 등)가 비어있으므로,
//   사이드바가 REQUEST_STATE로 다시 물어 현재 진행 상태를 복구한다.
//   재시작 감지는 "메시지 전송이 실패했는가"로 판단한다 — 채널이 끊겼다는
//   것 자체가 곧 서비스워커가 재기동됐다는 신호이기 때문.
// =========================================================================
function sendToBackground(message) {
  return chrome.runtime.sendMessage(message).catch((err) => {
    console.warn('[UiController] 백그라운드 연결 끊김 — 상태 복구 요청', err);
    return chrome.runtime.sendMessage({ type: 'REQUEST_STATE' }).catch(() => {
      // 그래도 실패하면 확장 컨텍스트 자체가 무효화된 것 — 사용자에게 새로고침 안내
      showPersistentToast('sw-lost', '연결이 끊어졌습니다. 페이지를 새로고침해주세요.', 'error');
    });
  });
}

function _applyTheme() {
  const saved = localStorage.getItem('spog-theme') || 'light';
  document.documentElement.dataset.theme = saved;
}

function init() {
  _applyTheme();
  // Panels.mount는 panels 번들(js/panels/*.tsx 묶음)이 노출하는 진입점 —
  // 내부적으로 ReactDOM.createRoot(container).render(<Shell />)를 호출한다.
  // 이 파일은 그 React 루트가 어디에 박히는지만 알고, 안쪽 렌더링에는
  // 관여하지 않는다.
  Panels.mount(document.getElementById('spog-sidebar-root'));
  switchPanel('panel-case'); // 기본 활성 패널
  updateStatus('대기 중', 'info');
}

window.UiController = {
  init, updateStatus, showToast, showPersistentToast, dismissToast,
  switchPanel, onCaseConnected, onInboundCountUpdated,
  startSecurityTimer, clearSecurityTimer, sendToBackground,
};

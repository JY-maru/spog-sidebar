// ui_controller.js
// [의사코드] 사이드바 셸. 이 확장의 UX 핵심 두 가지가 여기 있다.
//
//  1) 인터럽트 vs 앰비언트 — 모든 알림이 화면을 가로채면 상담을 방해한다.
//     "지금 이 건"에 해당하는 이벤트만 패널을 강제 전환하고, 나머지는 뱃지/점만 올린다.
//  2) 상태 복구 — 메시지 전송 실패를 서비스워커 재기동 신호로 읽고, 진행 상태를
//     다시 물어 화면을 맞춘다.

// ── 1) 알림 등급 ────────────────────────────────────────────────
// forced   : 케이스 연결처럼 즉시 봐야 하는 것 → 패널 강제 전환
// ambient  : 인바운드 문의 도착 등 → 뱃지 숫자만, 화면은 안 건드림
function onCaseConnected(caseInfo) {
  switchPanel('panel-case', { forced: true });
  Panels.caseActions.render(caseInfo);
}

function onInboundCountUpdated(count) {
  Panels.inboundActions.setBadgeCount(count); // 전환 없음
}

function switchPanel(id, { forced = false } = {}) {
  // forced가 아니면 사용자가 지금 보고 있는 패널을 빼앗지 않는다
  if (!forced && isUserInteracting()) { markTrackDot(id); return; }
  // …패널 표시 전환
}

// ── 2) 서비스워커 재기동 복구 ───────────────────────────────────
// MV3 서비스워커는 유휴 시 종료·재기동된다. 전송 실패를 재기동 신호로 사용한다.
function sendToBackground(message) {
  return chrome.runtime.sendMessage(message).catch(() => {
    // 재기동 직후에는 허브 메모리가 비어 있으므로 진행 상태를 다시 요청한다
    return chrome.runtime.sendMessage({ type: 'REQUEST_STATE' }).catch(() => {
      showPersistentToast('sw-lost', '연결이 끊어졌습니다. 페이지를 새로고침해주세요.', 'error');
    });
  });
}

// 호출자가 직접 닫을 때까지 유지되는 토스트. 같은 id로 다시 부르면 내용만 교체된다.
function showPersistentToast(id, text, tone) { Panels.toastActions.upsertPersistent(id, text, tone); }

// 일정 시간 입력이 없으면 케이스 연결을 자동 해제한다(유휴 해제 정책).
function startIdleReleaseTimer() {
  setTimeout(() => {
    StateManager.resetCaseInfo();
    Panels.caseActions.setDisconnected();
    showToast('일정 시간 입력이 없어 케이스 연결이 자동 해제되었습니다.', 'warning');
  }, RPA_APP_CONFIG.TIMEOUT.SECURITY_LOCK);
}

window.UiController = { init, switchPanel, sendToBackground, showPersistentToast };

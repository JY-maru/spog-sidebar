// [pseudo-code] ui_controller.ts
// 사이드바 셸. 패널 전환, 토스트, 상태 복구를 담당한다.
//
//  1) 알림 등급 — forced는 패널을 전환하고, ambient는 뱃지·점만 갱신한다.
//  2) 상태 복구 — 전송 실패 시 진행 상태를 다시 요청해 화면을 맞춘다.

// ── 1) 알림 등급 ────────────────────────────────────────────────
// forced  : 패널을 전환한다
// ambient : 뱃지 숫자만 갱신한다
function onCaseConnected(caseInfo: CaseInfo): void {
  switchPanel('panel-case', { forced: true });
  Panels.caseActions.render(caseInfo);
}

function onInboundCountUpdated(count: number): void {
  Panels.inboundActions.setBadgeCount(count); // 전환 없음
}

function switchPanel(id: string, { forced = false }: { forced?: boolean } = {}): void {
  // 인자: 패널 id, forced 여부. forced가 아니고 조작 중이면 점만 표시한다.
  if (!forced && isUserInteracting()) { markTrackDot(id); return; }
  // …패널 표시 전환
}

// ── 2) 서비스워커 재기동 복구 ───────────────────────────────────
// 인자: 보낼 메시지. 반환: 전송 결과. 전송 실패 시 진행 상태를 다시 요청한다.
function sendToBackground(message: object): Promise<unknown> {
  return chrome.runtime.sendMessage(message).catch(() => {
    // 진행 상태 재요청
    return chrome.runtime.sendMessage({ type: 'REQUEST_STATE' }).catch(() => {
      showPersistentToast('sw-lost', '연결이 끊어졌습니다. 페이지를 새로고침해주세요.', 'error');
    });
  });
}

// 인자: 토스트 id, 문구, 톤. 같은 id로 다시 부르면 내용만 교체된다.
function showPersistentToast(id: string, text: string, tone: ToneName): void { Panels.toastActions.upsertPersistent(id, text, tone); }

// SECURITY_LOCK 시간 동안 입력이 없으면 케이스 연결을 해제한다.
function startIdleReleaseTimer(): void {
  setTimeout(() => {
    StateManager.resetCaseInfo();
    Panels.caseActions.setDisconnected();
    showToast('일정 시간 입력이 없어 케이스 연결이 자동 해제되었습니다.', 'warning');
  }, RPA_APP_CONFIG.TIMEOUT.SECURITY_LOCK);
}

declare function isUserInteracting(): boolean;
declare function markTrackDot(id: string): void;
declare function init(): void;
interface CaseInfo { caseId: string }

window.UiController = { init, switchPanel, sendToBackground, showPersistentToast } as never;

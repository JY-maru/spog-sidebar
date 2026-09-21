// portal_entry.js
// [MOCK] 포털 콘텐츠 스크립트 — 진입 조건 판단 후
// MessageRouter/UiController 초기화만 수행한다. 실제 로직은 전부
// message_router.ts / ui_controller.js에 위임되어 있다.

const _currentUrl = decodeURIComponent(window.location.href);
const _isTopWindow = window.self === window.top;

if (_isTopWindow && _currentUrl.includes('/case/intake')) {
  console.log('[SPoG:PortalA] 접수 페이지 감지 완료. 초기화합니다.');

  // [자가복구] 스크립트 로드 순서상 ui_controller.js가 이 파일보다 먼저 실행되므로
  // window.UiController는 이 시점에 이미 존재해야 정상이다. 그런데도 비어있다면
  // 확장 컨텍스트가 깨진 상태(원인 불명 레이스) — 세션당 1회 자동 새로고침으로
  // 자가복구를 시도하고, 그래도 안 되면 무한루프 대신 에러만 남긴다.
  if (!window.UiController) {
    console.error('[SPoG:PortalA] window.UiController 초기화 실패 — 확장 컨텍스트 이상');
    if (!sessionStorage.getItem('SPOG_UICTRL_RECOVERY')) {
      sessionStorage.setItem('SPOG_UICTRL_RECOVERY', '1');
      location.reload();
    }
  } else {
    MessageRouter.init();
    setTimeout(() => UiController.init(), RPA_APP_CONFIG.TIMEOUT.WIDGET_INJECT);
  }
}

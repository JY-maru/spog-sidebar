// [pseudo-code] portal_entry.ts
// 포털 페이지 진입점. 초기화 순서만 담당한다.
//
// 흐름: 대상 화면 판단 → 메시지 버스 초기화 → UI 셸 마운트.

function init(): void {
  if (!isSidebarTarget(location)) return; // 사이드바를 붙일 화면이 아니면 아무것도 안 함

  MessageRouter.init();                   // 1) 수신 준비 (스키마·오리진 가드 등록)
  setTimeout(() => UiController.init(),    // 2) 위젯 주입 후 셸 마운트
            RPA_APP_CONFIG.TIMEOUT.WIDGET_INJECT);
}

// 인자: 현재 location. 반환: 사이드바를 띄울 화면인지 여부.
const SIDEBAR_PATHS = [/^\/intake(\/|$)/, /^\/cases(\/|$)/];

function isSidebarTarget(loc: Location): boolean {
  return SIDEBAR_PATHS.some((re) => re.test(loc.pathname));
}

init();

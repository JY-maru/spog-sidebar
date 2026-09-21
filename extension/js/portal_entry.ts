// portal_entry.ts
// [의사코드] 포털 페이지 진입점. 하는 일은 "초기화 순서 보장" 하나뿐이다.
//
// 흐름: 사이드바를 띄울 화면인지 판단 → 메시지 버스 먼저 → UI 셸 나중에.
// 수신 준비가 끝난 뒤에 UI를 올린다는 순서 규칙만 지키면 된다.

function init(): void {
  if (!isSidebarTarget(location)) return; // 사이드바를 붙일 화면이 아니면 아무것도 안 함

  MessageRouter.init();                   // 1) 수신 준비 (스키마·오리진 가드 등록)
  setTimeout(() => UiController.init(),    // 2) 위젯 주입 후 셸 마운트
            RPA_APP_CONFIG.TIMEOUT.WIDGET_INJECT);
}

function isSidebarTarget(loc: Location): boolean {
  // 포털의 특정 업무 화면에서만 사이드바를 띄운다 (경로 패턴 판단)
  return /* 경로 패턴 일치 */ true;
}

init();

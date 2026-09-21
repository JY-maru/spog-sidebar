// inbound_panel.tsx
// [의사코드] 사이드바 공통 셸 + 토스트 호스트 + 인바운드 문의 패널.
//
// 보여주는 것: 알림 등급 규칙.
//   - 인바운드 문의는 뱃지 숫자만 갱신하고 화면은 전환하지 않는다.
//   - 열려 있지 않은 패널에 영향을 주는 이벤트는 점(track-dot)으로 표시한다.

export function Shell() {
  return (
    <aside className="spog-sidebar">
      <Tabs />          {/* 패널별 뱃지·점 표시 */}
      <ActivePanel />
      <ToastHost />     {/* 자동 소멸 토스트 + 호출자가 직접 닫는 고정 토스트 */}
    </aside>
  );
}

export function InboundPanel() {
  const calls = useSharedStore((s) => s.inboundCalls);
  // 목록을 열어서 볼 때 읽음 처리한다 — 뱃지는 그때 내려간다.
  return <CallList items={calls} onOpen={markRead} />;
}

// 로딩 실패 시 스피너를 유지하지 않고 "다시 시도"를 보여준다.
function LoadFailed({ retry }: { retry: () => void }) {
  return <Retry onClick={retry} text="불러오지 못했습니다." />;
}

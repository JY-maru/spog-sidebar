// [pseudo-code] inbound_panel.tsx
// 사이드바 공통 셸 + 토스트 호스트 + 인바운드 문의 패널.
// 인바운드 문의는 뱃지 숫자만 갱신하고, 닫힌 패널의 이벤트는 점으로 표시한다.

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
  // 목록을 열면 읽음 처리한다.
  return <CallList items={calls} onOpen={markRead} />;
}

// 로딩 실패 시 "다시 시도"를 보여준다.
function LoadFailed({ retry }: { retry: () => void }) {
  return <Retry onClick={retry} text="불러오지 못했습니다." />;
}

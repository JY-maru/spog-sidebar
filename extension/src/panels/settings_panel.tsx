// settings_panel.tsx
// [의사코드] 설정 패널. 사이드바 자체의 환경설정만 다룬다.
//
// 두 그룹 모두 기본은 접힘 상태.

export function SettingsPanel() {
  return <>
    <Group title="연동 정보" defaultCollapsed>{/* 기록 시트 연결 정보 */}</Group>
    <Group title="알림" defaultCollapsed>{/* 인바운드 문의 알림음 on/off */}</Group>
  </>;
}

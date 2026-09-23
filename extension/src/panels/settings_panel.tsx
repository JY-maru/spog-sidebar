// [pseudo-code] settings_panel.tsx
// 설정 패널. 연동 정보와 알림 설정을 다룬다. 두 그룹 모두 기본은 접힘 상태.

export function SettingsPanel() {
  return <>
    <Group title="연동 정보" defaultCollapsed>{/* 기록 시트 연결 정보 */}</Group>
    <Group title="알림" defaultCollapsed>{/* 인바운드 문의 알림음 on/off */}</Group>
  </>;
}

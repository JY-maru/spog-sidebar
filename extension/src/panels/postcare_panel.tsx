// [pseudo-code] postcare_panel.tsx
// 사후관리 패널. 자동화 완료 이력과 마지막 동기화 시각을 조회해 표시한다.

export function PostcarePanel() {
  const [rows, setRows] = useState([]);
  const lastSync = useLastSyncTime();   // 마지막 동기화 시각을 저장해 보여준다

  return <>
    <SyncInfo at={lastSync} />
    <LogTable rows={rows} />            {/* 완료된 자동화 이력 */}
  </>;
}

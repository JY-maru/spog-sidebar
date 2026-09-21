// postcare_panel.tsx
// [의사코드] 사후관리 패널.
//
// 보여주는 것: 자동화가 남긴 흔적을 사용자가 직접 확인할 수 있게 하는 것.
// 모든 자동화 스텝은 쓰기 전용 로그로 남고, 이 패널에서 조회만 한다.

export function PostcarePanel() {
  const [rows, setRows] = useState([]);
  const lastSync = useLastSyncTime();   // 마지막 동기화 시각을 저장해 보여준다

  return <>
    <SyncInfo at={lastSync} />
    <LogTable rows={rows} />            {/* 완료된 자동화 이력 */}
  </>;
}

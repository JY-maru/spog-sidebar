// dispatch_panel.tsx
// [의사코드] 예약/배차 자동화 패널. 이 확장에서 기능이 가장 많은 곳.
//
// 보여주는 것: 원버튼 자동화와 "읽기/쓰기" 구분. 사용자가 누르기 전에
// 이 버튼이 데이터를 바꾸는지(쓰기) 조회만 하는지(읽기)를 알 수 있게 한다.

export function DispatchPanel() {
  const blocks = useTrackingStore((s) => s.blocks);

  return (
    <>
      <Action kind="쓰기" label="블록 생성"   onClick={() => run('REQ_CREATE_RESERVATION_BLOCK')} />
      <Action kind="읽기" label="후보 검색"   onClick={() => run('REQ_CANDIDATE_SEARCH_START')} />
      <Action kind="쓰기" label="예약 생성"   onClick={() => run('REQ_DISPATCH_EXECUTE')} />

      {/* 새로 생긴 블록은 잠깐 강조된다 — 자동화가 무엇을 했는지 눈으로 확인 */}
      <BlockTable rows={blocks} highlightNew />
    </>
  );
}

function run(type: string) {
  UiController.updateStatus('예약·배차 시스템으로 이동해 처리합니다...');
  sendToHub({ type });  // 허브가 탭을 열고 전면으로 보여준 뒤, 끝나면 포털로 돌려보낸다
}

// 후보 검색을 빠르게 두 번 눌러도 표에는 마지막 요청 결과만 남는다
// (세대 카운터는 dispatch_system_driver.js에 있다).

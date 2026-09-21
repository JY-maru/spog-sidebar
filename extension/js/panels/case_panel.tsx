// case_panel.tsx
// [의사코드] 케이스 처리 패널 (기본 활성).
//
// 사이드바의 출발점. 받아 적은 텍스트를 붙여넣으면 항목별로 정리해서 보여주고,
// 버튼 한 번으로 케이스 관리 시스템에 카드를 만든다.

export function CasePanel() {
  const caseInfo = useSharedStore((s) => s.caseInfo);

  // 아직 연결 전이면 "생성" 화면, 연결됐으면 케이스 상세를 보여준다.
  return caseInfo ? <CaseDetail info={caseInfo} /> : <CreateForm />;
}

async function onCreateClick() {
  const raw = await requestFromEmbedFrame('intake_text');  // 포털의 임베드 폼에서 원문 읽기
  const fields = TextParser.parse(raw);

  // 필수 항목이 없으면 시작하지 않는다(text_parser.ts의 시작 조건과 동일).
  if (!TextParser.isEnoughToSubmit(fields)) return toast('접수양식을 먼저 채워주세요.', 'warning');

  UiController.updateStatus('케이스 관리 시스템으로 이동해 접수 카드를 생성합니다...');
  sendToHub({ type: 'REQ_CREATE_CASE', fields });
  // 결과는 기다리지 않는다. 카드가 만들어지면 허브가 CASE_CREATED를 보내고,
  // 그 시점에 이 패널이 전면으로 전환된다(인터럽트 등급).
}

// text_parser.ts
// [의사코드] 받아 적은 접수양식 텍스트 → 구조화 필드.
//
// 이 파일이 보여주는 것: 입력 형식을 강제하지 않는 파싱.
// 줄 순서·공백·구분자(: 또는 -)가 달라도 라벨 텍스트로 찾는다.

const LABELS = {
  customerName: ['고객명', '성명', '이름'],
  phone:        ['연락처', '전화', '휴대폰'],
  resourceCode: ['식별코드', '차량번호', '차번'],
  receivedAt:   ['접수일시', '접수시각'],
  location:     ['위치', '장소'],
  detail:       ['상세내용', '내용', '비고'],
};

function parseIntakeText(raw: string): Fields {
  const fields: Fields = {};
  for (const line of raw.split('\n')) {
    const [label, value] = splitLabelAndValue(line); // ':' 또는 '-' 기준, 없으면 스킵
    const key = matchLabel(label);                    // 동의어 목록에서 찾는다
    if (key && value) fields[key] = normalize(key, value);
  }
  return fields;
}

// 값 정규화는 필드별로 다르다 — 전화번호는 하이픈 통일, 일시는 포맷 통일 등.
function normalize(key: string, value: string): string { /* … */ return value.trim(); }

// 필수 항목이 없으면 자동화를 시작하지 않는다. 시스템 간 공유 트랜잭션이 없어
// 중간 단계만 반영된 상태를 되돌릴 수 없기 때문에, 시작 조건을 먼저 확인한다.
function isEnoughToSubmit(fields: Fields): boolean {
  return !!(fields.customerName && fields.resourceCode);
}

type Fields = Partial<Record<keyof typeof LABELS, string>>;

declare function splitLabelAndValue(line: string): [string, string];
declare function matchLabel(label: string): keyof typeof LABELS | undefined;

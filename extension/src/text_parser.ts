// [pseudo-code] text_parser.ts
// 접수양식 텍스트를 구조화 필드로 변환한다.
// 줄 순서·공백·구분자(: 또는 -)와 무관하게 라벨 텍스트로 항목을 찾는다.

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

// 인자: 필드 키, 원문 값. 반환: 정규화된 값.
function normalize(key: string, value: string): string { /* … */ return value.trim(); }

// 인자: 파싱된 필드. 반환: 자동화를 시작할 수 있는지 여부.
function isEnoughToSubmit(fields: Fields): boolean {
  return !!(fields.customerName && fields.resourceCode);
}

type Fields = Partial<Record<keyof typeof LABELS, string>>;

declare function splitLabelAndValue(line: string): [string, string];
declare function matchLabel(label: string): keyof typeof LABELS | undefined;

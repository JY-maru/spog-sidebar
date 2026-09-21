// text_parser.js
// [MOCK] 비정형 접수양식 텍스트 → 구조화 필드 파싱. 상담원이 받아
// 적은 그대로("- 라벨 : 값" 또는 "1) 라벨 : 값" 등 표기가 제각각인 텍스트)를
// 그대로 붙여넣을 수 있도록, 라벨 "텍스트"를 기준으로 매핑하고 순서/공백에
// 관대하게 파싱한다. 고객 응대 시스템의 상담이력 원문 파싱에도 재사용된다.

// 이 라벨들이 전부 있어야 "접수양식"으로 인정한다(아니면 그냥 일반 메모 텍스트로
// 보고 null 반환 — 잘못된 자동화 트리거를 막기 위한 최소 방어).
const REQUIRED_LABELS = ['예약번호', '자산번호', '보험사', '신고자', '운전자', '사고시각', '사고장소'];

function parseIntakeTemplate(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  for (const label of REQUIRED_LABELS) {
    if (!rawText.includes(label)) return null;
  }

  const fields = {};
  rawText.split(/\r?\n/).forEach((line) => {
    // "- 라벨 : 값" / "1) 라벨 : 값" / "라벨: 값" 등 다양한 표기를 한 정규식으로 흡수.
    // 콜론(반각/전각 모두) 좌측을 라벨, 우측을 값으로 취급 — 순서가 뒤바뀌어도,
    // 앞에 불릿/번호가 붙어도 안전하게 매칭된다.
    const m = line.match(/^\s*(?:[-*]|\d+\))?\s*([가-힣A-Za-z0-9()/·\s]+?)\s*[:：]\s*(.*)$/);
    if (m) {
      const label = m[1].trim();
      const value = m[2].trim();
      if (label) fields[label] = value;
    }
  });
  return fields;
}

// 라벨 딕셔너리 → 콘텐츠 스크립트가 쓰는 필드명으로 변환 (동의어 흡수 포함)
const LABEL_ALIASES = {
  예약번호: 'resId', 자산번호: 'resourceId', 보험사: 'insuranceCompany',
  신고자: 'reporterName', '신고자 연락처': 'reporterPhone',
  운전자: 'driverName', '운전자 연락처': 'driverPhone',
  사고시각: 'accidentAt', 사고장소: 'location',
};
function normalizeFields(rawFields) {
  const out = {};
  for (const [label, value] of Object.entries(rawFields)) {
    const key = LABEL_ALIASES[label] || label;
    out[key] = value;
  }
  return out;
}

window.TextParser = { parseIntakeTemplate, normalizeFields };

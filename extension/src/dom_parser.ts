// [pseudo-code] dom_parser.ts
// HTML 표를 객체 배열로 변환한다.
// 컬럼은 위치가 아니라 헤더 텍스트로 찾는다.

const COLUMN_LABELS = {
  reservationNo: ['예약번호', '예약 번호'],
  resourceCode:  ['차량번호', '식별코드'],
  startAt:       ['시작', '시작일시'],
  status:        ['상태'],
};

function parseTable(table: Element): Row[] {
  const index = buildHeaderIndex(table);  // 헤더 텍스트 → 컬럼 위치
  return [...table.querySelectorAll('tbody tr')]
    .filter((tr) => !isEmptyMessageRow(tr)) // "데이터 없음" 행은 결과가 아니다
    .map((tr) => readRow(tr, index));
}

// 인자: 표 엘리먼트. 반환: 헤더 텍스트 → 컬럼 위치 맵. 못 찾은 컬럼은 비운다.
function buildHeaderIndex(table: Element): HeaderIndex {
  const index: HeaderIndex = {};
  [...table.querySelectorAll('thead th')].forEach((th, i) => {
    const key = matchColumn(th.textContent);
    if (key) index[key] = i;
  });
  return index;
}

function readRow(tr: Element, index: HeaderIndex): Row {
  const cells = tr.querySelectorAll('td');
  const row: Row = {};
  for (const [key, i] of Object.entries(index)) row[key] = cells[i]?.textContent?.trim();
  return row;
}

type HeaderIndex = Record<string, number>;

declare function matchColumn(text: string | null): string | undefined;
declare function isEmptyMessageRow(tr: Element): boolean;

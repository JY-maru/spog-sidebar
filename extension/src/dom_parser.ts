// dom_parser.ts
// [의사코드] 다른 시스템의 HTML 표 → 객체 배열.
//
// 이 파일이 보여주는 것: 위치가 아니라 의미로 읽는 표 파싱.
// 컬럼을 nth-child가 아니라 헤더 텍스트로 찾으므로, 열 순서나 개수가 바뀌어도
// 같은 코드가 그대로 동작한다.

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

// 헤더에서 찾지 못한 컬럼은 undefined로 남긴다. 추측해서 채우지 않는다.
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

type Row = Record<string, string | undefined>;
type HeaderIndex = Record<string, number>;

declare function matchColumn(text: string | null): string | undefined;
declare function isEmptyMessageRow(tr: Element): boolean;

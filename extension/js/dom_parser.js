// dom_parser.js
// [MOCK] 예약·배차 시스템 화면의 HTML 표를 파싱하는 순수 함수 모음.
// 다른 시스템이 내려주는 표는 마크업이 자주 바뀌므로, 컬럼 "인덱스"가 아니라
// 헤더 "텍스트"로 컬럼을 찾아 매핑한다 — 열 순서가 바뀌어도 안 깨지게 하기 위함.

function extractCleanDate(text) {
  const m = String(text || '').match(/\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2})?/);
  return m ? m[0] : '';
}

function getCellText(row, headerMap, headerName) {
  const idx = headerMap.get(headerName);
  if (idx == null) return '';
  return row.children[idx]?.textContent?.trim() || '';
}
function getCellHtml(row, headerMap, headerName) {
  const idx = headerMap.get(headerName);
  if (idx == null) return '';
  return row.children[idx]?.innerHTML || '';
}

// 헤더 행에서 "텍스트 → 컬럼 인덱스" 맵을 만든다. 이 맵을 만든 뒤부터는 표
// 마크업(열 순서, 추가/삭제된 열)이 바뀌어도 헤더 텍스트만 유지되면 안전하다.
function _buildHeaderMap(theadRow) {
  const map = new Map();
  [...theadRow.children].forEach((th, i) => map.set(th.textContent.trim(), i));
  return map;
}

function parseReservationTable(tableEl) {
  const headerMap = _buildHeaderMap(tableEl.querySelector('thead tr'));
  const rows = [...tableEl.querySelectorAll('tbody tr')];
  return rows.map((row) => ({
    resId: getCellText(row, headerMap, '예약번호'),
    resourceId: getCellText(row, headerMap, '자산번호'),
    startAt: extractCleanDate(getCellText(row, headerMap, '시작일시')),
    endAt: extractCleanDate(getCellText(row, headerMap, '종료일시')),
    regionName: getCellText(row, headerMap, '지역'),
    statusHtml: getCellHtml(row, headerMap, '상태'), // 상태는 배지 아이콘 포함 HTML 그대로 보존
  }));
}

// 요금/보장옵션 상세 — "라벨: 값" 형태로 늘어선 셀 내부 텍스트를 파싱
function parseChargeDetail(cellHtml) {
  const container = document.createElement('div');
  container.innerHTML = cellHtml;
  const result = {};
  container.querySelectorAll('tr, li, div.charge-line').forEach((line) => {
    const text = line.textContent.trim();
    const m = text.match(/^(.+?)[:：]\s*(.+)$/);
    if (m) result[m[1].trim()] = m[2].trim();
  });
  return result;
}

// 블락(일정 점유) 시간 계산 — 시작/종료 예약시간에 전후 버퍼(청소/점검 등)를
// 더해 실제 점유 구간을 산출한다.
function calculateBlockTime(startAt, endAt, { bufferBeforeMin = 30, bufferAfterMin = 30 } = {}) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  start.setMinutes(start.getMinutes() - bufferBeforeMin);
  end.setMinutes(end.getMinutes() + bufferAfterMin);
  return { blockStart: start, blockEnd: end };
}
function calculateManualBlockTime(startAt, endAt, manualBufferMin) {
  return calculateBlockTime(startAt, endAt, { bufferBeforeMin: manualBufferMin, bufferAfterMin: manualBufferMin });
}
function calculateDurationText(startAt, endAt) {
  const ms = new Date(endAt) - new Date(startAt);
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}일 ${hours % 24}시간` : `${hours}시간`;
}

// 상세 페이지 HTML에서 내부 리소스 ID(URL 파라미터 등에서 노출되는 값)를 추출
function extractResourceIdFromHtml(html) {
  const m = html.match(/data-resource-id="(\d+)"/) || html.match(/\/resource\/(\d+)\//);
  return m ? m[1] : null;
}

function buildSearchUrl(base, params) {
  const url = new URL(base, location.origin);
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v); });
  return url.toString();
}
function buildRouteUrl(resourceId, { startAt, endAt } = {}) {
  return buildSearchUrl('/dispatch/route', { resourceId, startAt, endAt });
}

window.DomParser = {
  extractCleanDate, parseReservationTable, parseChargeDetail,
  calculateBlockTime, calculateManualBlockTime, calculateDurationText,
  extractResourceIdFromHtml, buildSearchUrl, buildRouteUrl,
};

// [pseudo-code] dispatch_system_driver.ts
// 예약·배차 시스템 페이지 자동화.
// 후보 검색과 예약 블록 생성을 수행하며, 세대 카운터로 마지막 요청의 결과만 보고한다.

// 메인 월드 인터셉터를 주입하고, nonce로 이름 지은 채널로 결과를 받는다.
const DISPATCH_NONCE = crypto.randomUUID();
injectScript('src/dispatch_system_interceptor.ts', DISPATCH_NONCE);
onInterceptorEvent(`dispatch-intercept:${DISPATCH_NONCE}`, sendToHub);

let searchGeneration = 0;

// ── 후보 검색 ──────────────────────────────────────────────────
onCommand('DO_CANDIDATE_SEARCH_START', async (req) => {
  const gen = ++searchGeneration;   // 이번 요청의 세대

  for (const scope of expandingScopes(req)) {     // 가까운 범위부터 점점 넓혀 조회
    const rows = await scanTable(scope);
    if (gen !== searchGeneration) return;          // 새 요청이 들어왔으면 이 결과는 버린다
    report({ type: 'CANDIDATE_SEARCH_PROGRESS', scope, found: rows.length });
  }

  if (gen !== searchGeneration) return;
  report({ type: 'CANDIDATE_SEARCH_RESULT', candidates: CandidateSearch.rank(collected) });
});

// 세대를 올려 진행 중인 검색 결과를 버린다.
onCommand('DO_CANDIDATE_SEARCH_STOP', () => { searchGeneration += 1; });

// ── 예약 블록 생성 ─────────────────────────────────────────────
onCommand('DO_CREATE_RESERVATION_BLOCK', async (req) => {
  await fillForm(req.fields);
  await submit();

  // 생성 여부를 다시 스캔해 확인한 뒤 보고한다.
  const confirmed = await rescanForBlock(req.blockKey);
  report({ type: 'RESERVATION_BLOCK_CREATED', ok: !!confirmed, block: confirmed });
});

// ── 화면 구조 변화에 견디는 표 읽기 ────────────────────────────
// 인자: 스캔 범위. 반환: 표에서 읽은 행 배열(dom_parser.ts에 위임).
async function scanTable(scope: string): Promise<Row[]> {
  await waitForElement('.list-table tbody tr', RPA_APP_CONFIG.TIMEOUT.ELEMENT_LONG);
  return DomParser.parseTable(document.querySelector('.list-table')!);
}


declare const DomParser: { parseTable(table: Element): Row[] };
declare const CandidateSearch: { rank(session: unknown): Row[] };
declare const collected: unknown;
declare function rescanForBlock(key: string): Promise<Row | null>;

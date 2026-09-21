// dispatch_system_driver.ts
// [의사코드] 예약·배차 시스템 페이지 자동화.
//
// 이 파일이 보여주는 것: "여러 번 눌러도 화면이 꼬이지 않는 자동화".
// 잠금 대신 세대(generation) 카운터를 쓴다. 불변식: 화면에 남는 것은 항상
// 마지막 요청의 결과다.

injectScript('src/dispatch_system_interceptor.ts');

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

// 사용자가 "탐색 중지"를 누르면 세대를 올려 진행 중인 루프를 무효화한다.
onCommand('DO_CANDIDATE_SEARCH_STOP', () => { searchGeneration += 1; });

// ── 예약 블록 생성 ─────────────────────────────────────────────
onCommand('DO_CREATE_RESERVATION_BLOCK', async (req) => {
  await fillForm(req.fields);
  await submit();

  // 대상 화면은 생성 직후 즉시 갱신되지 않으므로, 다시 스캔해 확인한 뒤 보고한다.
  // 규칙: 보고 직전에 항상 현재 상태를 재확인한다.
  const confirmed = await rescanForBlock(req.blockKey);
  report({ type: 'RESERVATION_BLOCK_CREATED', ok: !!confirmed, block: confirmed });
});

// ── 화면 구조 변화에 견디는 표 읽기 ────────────────────────────
// 컬럼 순서가 아니라 헤더 텍스트로 열을 찾는다(dom_parser.ts에 위임).
async function scanTable(scope: string): Promise<Row[]> {
  await waitForElement('.list-table tbody tr', RPA_APP_CONFIG.TIMEOUT.ELEMENT_LONG);
  return DomParser.parseTable(document.querySelector('.list-table')!);
}

type Row = Record<string, string | undefined>;

declare const DomParser: { parseTable(table: Element): Row[] };
declare const CandidateSearch: { rank(session: unknown): Row[] };
declare const collected: unknown;
declare function expandingScopes(req: unknown): Iterable<string>;
declare function rescanForBlock(key: string): Promise<Row | null>;

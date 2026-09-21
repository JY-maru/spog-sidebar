// case_system_driver.ts
// [의사코드] 케이스 관리 시스템 페이지 자동화. 격리 월드에서 실행된다.
//
// 이 파일이 보여주는 것: "사람이 하던 폼 입력을 그대로 대행한다".
// 대상 시스템이 정한 입력 경로(화면)를 그대로 따라가므로, 그 시스템의 검증·
// 후처리 규칙이 평소와 동일하게 적용된다.

// 메인 월드 인터셉터를 주입한다 — 격리 월드는 페이지의 fetch를 볼 수 없다.
// 주입할 때 1회용 nonce를 함께 건네고, 그 nonce로 이름 지은 채널로만 결과를 받는다.
// chrome.scripting.executeScript({ world: 'MAIN', args: [NONCE] })로 주입한다.
const NONCE = crypto.randomUUID();
injectScript('src/case_system_interceptor.ts', NONCE);

// ── 명령 수신 ──────────────────────────────────────────────────
onCommand('DO_CREATE_CASE', async ({ fields }) => {
  UiController.updateStatus('케이스 생성 중...');

  // 1) 필드를 하나씩, 사람이 치는 속도로 채운다 — 페이지의 단계별 검증과 보조를 맞춘다.
  for (const [name, value] of Object.entries(fields)) {
    const input = await waitForElement(`[name="${name}"]`);
    if (!input) return report({ success: false, error: `필드를 찾지 못했습니다: ${name}` });
    setValueAndNotify(input, value);
    await wait(FIELD_DELAY_MS);
  }

  // 2) 제출. 결과는 이 함수가 기다리지 않는다 — 인터셉터가 응답을 가로채
  //    CASE_CREATED로 허브에 올려주고, 사이드바는 그걸 받아 표시한다.
  (await waitForElement('button[type=submit]')).click();
});

// Vue/React 같은 반응형 프레임워크는 DOM 값 대입만으로는 변경을 감지하지 못한다.
// 네이티브 setter를 호출한 뒤 input 이벤트를 수동 디스패치해 동기화한다.
function setValueAndNotify(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── 조회 결과 해석 ─────────────────────────────────────────────
// "결과 없음"(정상)과 "조회 실패"(에러)를 구분해서 보고한다.
async function readSearchResult(): Promise<SearchResult> {
  const row = await waitForElement('.result-table tbody tr');
  if (!row) return { status: 'failed' };            // 표 자체가 안 그려짐 → 장애
  if (isEmptyMessage(row)) return { status: 'empty' }; // "데이터 없음" → 정상
  return { status: 'ok', data: parseRow(row) };
}

// 폴링 기반 대기 — 사내 시스템은 렌더 완료 신호를 주지 않으므로 직접 기다린다.
async function findElement(selector: string, timeoutMs = RPA_APP_CONFIG.TIMEOUT.ELEMENT_DEFAULT): Promise<Element | null> {
  /* timeoutMs까지 100ms 간격으로 탐색, 못 찾으면 null */
}

// ── 메인 월드 → 이 스크립트 릴레이 ────────────────────────────
// nonce로 이름 지은 채널만 듣는다 — 이 주입이 건넨 nonce를 아는 쪽의 이벤트만 도달한다.
window.addEventListener(`case-intercept:${NONCE}`, (e: Event) => {
  const msg = (e as CustomEvent).detail;
  if (msg?.type === 'INTERCEPTED_CASE') sendToHub(msg);
});

type SearchResult =
  | { status: 'ok'; data: Record<string, string> }
  | { status: 'empty' }
  | { status: 'failed' };

declare const UiController: { updateStatus(text: string): void };
declare const FIELD_DELAY_MS: number;

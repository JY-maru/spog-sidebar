// [pseudo-code] case_system_driver.ts
// 케이스 관리 시스템 페이지 자동화. 격리 월드에서 실행된다.
// 화면의 폼을 채우고 제출하며, 조회 결과를 읽어 허브에 보고한다.

// 메인 월드 인터셉터를 주입하고, nonce로 이름 지은 채널로 결과를 받는다.
const CASE_NONCE = crypto.randomUUID();
injectScript('src/case_system_interceptor.ts', CASE_NONCE);

// ── 명령 수신 ──────────────────────────────────────────────────
onCommand('DO_CREATE_CASE', async ({ fields }) => {
  UiController.updateStatus('케이스 생성 중...');

  // 1) 필드를 순서대로 채운다.
  for (const [name, value] of Object.entries(fields)) {
    const input = (await waitForElement(`[name="${name}"]`)) as HTMLInputElement | null;
    if (!input) return report({ success: false, error: `필드를 찾지 못했습니다: ${name}` });
    setValueAndNotify(input, String(value));
    await wait(FIELD_DELAY_MS);
  }

  // 2) 제출한다. 생성 결과는 인터셉터가 CASE_CREATED로 허브에 올린다.
  const submitBtn = (await waitForElement('button[type=submit]')) as HTMLButtonElement | null;
  if (!submitBtn) return report({ success: false, error: '제출 버튼을 찾지 못했습니다.' });
  submitBtn.click();
});

// 인자: 입력 엘리먼트, 넣을 값.
// 네이티브 setter를 호출한 뒤 input 이벤트를 디스패치한다.
function setValueAndNotify(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── 조회 결과 해석 ─────────────────────────────────────────────
// 반환: ok(데이터) / empty(결과 없음) / failed(조회 실패).
async function readSearchResult(): Promise<SearchResult> {
  const row = await waitForElement('.result-table tbody tr');
  if (!row) return { status: 'failed' };            // 표 자체가 안 그려짐 → 장애
  if (isEmptyMessage(row)) return { status: 'empty' }; // "데이터 없음" → 정상
  return { status: 'ok', data: parseRow(row) };
}

// 인자: 선택자, 타임아웃(ms). 반환: 엘리먼트 또는 null.
async function findElement(selector: string, timeoutMs = RPA_APP_CONFIG.TIMEOUT.ELEMENT_DEFAULT): Promise<Element | null> {
  /* timeoutMs까지 100ms 간격으로 탐색 */
  return document.querySelector(selector);
}

// ── 메인 월드 → 이 스크립트 릴레이 ────────────────────────────
// 주입할 때 만든 nonce 채널의 이벤트를 받아 허브로 올린다.
window.addEventListener(`case-intercept:${CASE_NONCE}`, (e: Event) => {
  const msg = (e as CustomEvent).detail;
  if (msg?.type === 'INTERCEPTED_CASE') sendToHub(msg);
});

type SearchResult =
  | { status: 'ok'; data: Record<string, string> }
  | { status: 'empty' }
  | { status: 'failed' };

declare const FIELD_DELAY_MS: number;

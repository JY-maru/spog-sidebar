// [pseudo-code] message_router.ts
// 포털 쪽 메시지 허브. 메시지 수신 등록과 분배를 담당한다.
//
// 분배 전에 세 가지를 확인한다.
//   a) 스키마 — 타입별 필수 필드
//   b) 발신자 — 등록 시 선언한 허용 발신자 부류
//   c) 타임아웃 — 응답 대기 상한

type Handler = (msg: any, sender?: any, respond?: (r?: any) => void) => unknown;

// ── 오리진 판정 ────────────────────────────────────────────────
// 발신자 판정 함수들.
type SenderKind = 'self' | 'embed-sandbox' | 'extension';

// 인자: 오리진과 발신자 부류. 반환: 허용 여부. 임베드 샌드박스는 상수와 완전 일치.
function isAllowedOrigin(origin: string, kind: 'self' | 'embed-sandbox'): boolean {
  return kind === 'self' ? origin === window.location.origin : origin === EMBED_SANDBOX_ORIGIN;
}

// 인자: sender. 반환: 발신자 부류.
function isAllowedSender(sender: any, kind: SenderKind): boolean {
  return kind === 'extension' && sender?.id === chrome.runtime.id && !sender.tab;
}

// ── 타입드 레지스트리 ──────────────────────────────────────────
// 타입별 핸들러 레지스트리. 같은 타입을 두 번 등록하면 로드 시점에 에러를 던진다.
const handlers = new Map<string, { schema: Schema; from: SenderKind; handler: Handler }>();

// 인자: 타입, 스키마, 허용 발신자 부류, 핸들러.
function register(type: string, schema: Schema, from: SenderKind, handler: Handler) {
  if (handlers.has(type)) throw new Error(`중복 등록된 타입: ${type}`);
  handlers.set(type, { schema, from, handler });
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const entry = handlers.get(msg?.type);
  if (!entry) return false;                             // 등록되지 않은 타입은 처리하지 않는다
  if (!isAllowedSender(sender, entry.from)) return false; // 선언된 발신자 부류와 대조
  if (!entry.schema.isValid(msg)) return false;         // 스키마 불일치도 마찬가지
  return entry.handler(msg, sender, respond);
});

// ── 임베드 폼 ↔ 케이스 관리 시스템 교차검증 ────────────────────
// 화면의 폼과 케이스가 같은 건인지 대조한 뒤에만 "연결됨"으로 표시한다.
// 확인 불가(타임아웃)는 불일치와 같게 처리한다.
async function handleInterceptedCase(msg: any) {
  const formData = await requestFromEmbedFrame('intake_text', 2000); // 타임아웃 시 null
  if (!formData || !isSameCase(formData, msg)) {
    UiController.showToast('화면의 접수 건과 생성된 케이스가 일치하지 않습니다.', 'error');
    return;
  }
  UiController.onCaseConnected(msg);
}

// 인자: 요청 종류(kind), 타임아웃(ms). 반환: 응답 payload 또는 null.
// 요청마다 nonce를 만들어 임베드 오리진으로 보내고, 같은 nonce를 단 응답만 받는다.
function requestFromEmbedFrame(kind: string, timeoutMs: number): Promise<any | null> {
  return new Promise((resolve) => {
    const nonce = crypto.randomUUID();
    const timer = setTimeout(() => { cleanup(); resolve(null); }, timeoutMs);
    function onMessage(e: MessageEvent) {
      if (!isAllowedOrigin(e.origin, 'embed-sandbox')) return; // 상수와 완전 일치
      if (e.source !== embedFrame()) return;                   // 그 프레임이 직접 보낸 것
      if (e.data?.type === 'RESPONSE_DATA' && e.data.nonce === nonce) {
        clearTimeout(timer); cleanup(); resolve(e.data.payload);
      }
    }
    function cleanup() { window.removeEventListener('message', onMessage); }
    window.addEventListener('message', onMessage);
    embedFrame().postMessage({ type: 'REQUEST_DATA', kind, nonce }, EMBED_SANDBOX_ORIGIN);
  });
}

export function init() {
  register('INTERCEPTED_CASE', CaseSchema, 'extension', handleInterceptedCase);
  register('INBOUND_CALLBACK_COUNT_UPDATE', CountSchema, 'extension', (m) => UiController.onInboundCountUpdated(m.count));
  register('CLIENT_CONFIG_UPDATED', ConfigSchema, 'extension', applyClientConfig);
  // …이하 동일한 모양으로 추가
}

declare const EMBED_SANDBOX_ORIGIN: string;
declare const UiController: any, StateManager: any;
declare function isSameCase(a: any, b: any): boolean;
declare function embedFrame(): Window;
declare function applyClientConfig(m: any): void;
interface Schema { isValid(v: unknown): boolean }
declare const CaseSchema: Schema, CountSchema: Schema, ConfigSchema: Schema;

// message_router.ts
// [의사코드] 포털 쪽 메시지 허브. 메시지 수신 등록은 전부 이 파일을 거친다.
//
// 등록·검증·분배가 한 곳에 모여 있어, 수신 경로마다 규칙이 갈리지 않는다.
// 세 가지를 한 곳에서 보장한다.
//   a) 스키마 — 타입별로 필요한 필드가 있는지
//   b) 발신자 — 타입마다 허용 발신자 부류(self / 임베드 샌드박스 / 확장 배경)를
//      등록 시점에 선언하고, 리스너가 분배 전에 그 선언대로 판정한다
//   c) 타임아웃 — 응답 없는 요청을 영원히 기다리지 않는지

type Handler = (msg: any, sender?: any, respond?: (r?: any) => void) => unknown;

// ── 오리진 판정 ────────────────────────────────────────────────
// 검증을 통과한 메시지만 핸들러에 도달한다.
type SenderKind = 'self' | 'embed-sandbox' | 'extension';

// 페이지 간 postMessage용 판정. 임베드 샌드박스는 상수와 완전 일치를 본다.
function isAllowedOrigin(origin: string, kind: 'self' | 'embed-sandbox'): boolean {
  return kind === 'self' ? origin === window.location.origin : origin === EMBED_SANDBOX_ORIGIN;
}

// chrome.runtime 경로용 판정. 이 확장의 배경 페이지가 보낸 것만 'extension'이다.
function isAllowedSender(sender: any, kind: SenderKind): boolean {
  return kind === 'extension' && sender?.id === chrome.runtime.id && !sender.tab;
}

// ── 타입드 레지스트리 ──────────────────────────────────────────
// 새 이벤트를 늘릴 때 손대는 곳은 등록 한 줄뿐이다.
// 같은 타입을 두 번 등록하면 로드 시점에 즉시 에러 — 런타임까지 끌고 가지 않는다.
const handlers = new Map<string, { schema: Schema; from: SenderKind; handler: Handler }>();

// 등록 한 줄에 스키마와 허용 발신자 부류가 함께 적힌다.
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
// 사이드바가 "연결됨"으로 표시하려면 화면의 폼과 케이스가 같은 건이어야 한다.
// 시스템 간 공유 트랜잭션이 없어 확장이 직접 대조한다.
// 확인 불가(타임아웃)는 불일치와 같게 취급한다 — fail-closed.
async function handleInterceptedCase(msg: any) {
  const formData = await requestFromEmbedFrame('intake_text', 2000); // 타임아웃 시 null
  if (!formData || !isSameCase(formData, msg)) {
    UiController.showToast('화면의 접수 건과 생성된 케이스가 일치하지 않습니다.', 'error');
    return;
  }
  UiController.onCaseConnected(msg);
}

// 임베드 폼은 포털과 다른 샌드박스 오리진에서 렌더링되므로 왕복에도 같은 판정을 적용한다.
// 요청마다 nonce를 만들어 정확히 그 오리진으로 보내고, 같은 nonce를 단 응답만 받는다.
// 시간 안에 오지 않으면 null을 돌려준다.
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

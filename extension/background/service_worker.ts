// [pseudo-code] service_worker.ts
// 백그라운드 허브. 네 시스템 탭 사이의 메시지를 중계한다.
//
// 구성:
//   0) 발신자 인가 — 오리진→역할, 역할→허용 타입 표
//   1) 중계
//   2) 탭 오케스트레이션 — 탭 열기·포커스·복귀
//   3) 세대 카운터
//   4) 재기동 시 상태 복원
//
// 대상 호스트는 전부 로컬 모의 서버다.

const HOSTS = { PORTAL: 8081, CASE: 8082, DISPATCH: 8083, CUSTOMER: 8084 };
const LABEL = { CASE: '케이스 관리 시스템', DISPATCH: '예약·배차 시스템', CUSTOMER: '고객 응대 시스템' };

let hubState = { currentLoginId: '', step: 'idle' };

// ── 0) 발신자 인가 ─────────────────────────────────────────────
// 오리진 → 역할, 역할 → 허용 메시지 타입 집합.
const ROLE_BY_ORIGIN = Object.freeze({
  [`http://localhost:${HOSTS.PORTAL}`]: 'portal',
  [`http://localhost:${HOSTS.CASE}`]: 'case',
  [`http://localhost:${HOSTS.DISPATCH}`]: 'dispatch',
  [`http://localhost:${HOSTS.CUSTOMER}`]: 'customer',
} as const);

const ALLOWED_TYPES: Readonly<Record<Role, ReadonlySet<string>>> = Object.freeze({
  portal: new Set(['REQ_CREATE_CASE', 'REQ_CREATE_RESERVATION_BLOCK', 'REQ_DISPATCH_EXECUTE', 'REQ_BULLETIN_WRITE', 'REQUEST_STATE']),
  case: new Set(['INTERCEPTED_CASE', 'CASE_CREATED']),
  dispatch: new Set(['INTERCEPTED_RESERVATIONS', 'DISPATCH_EXECUTE_RESULT']),
  customer: new Set(['INBOUND_CALLBACK', 'INTERCEPTED_AGENT_INFO']),
});

// 인자: 메시지와 발신자. 반환: 허용 조합이면 역할, 아니면 null.
function authorize(msg: any, sender: Sender): Role | null {
  if (sender.id !== ownExtensionId()) return null;
  if (sender.frameId !== 0) return null;
  const role = ROLE_BY_ORIGIN[originOf(sender.url)];
  return role && ALLOWED_TYPES[role].has(msg?.type) ? role : null;
}

// 타입별 핸들러 등록 맵.
const hubHandlers = new Map<string, (msg: any, sender: Sender) => void>();
function onHubMessage(type: string, fn: (msg: any, sender: Sender) => void) { hubHandlers.set(type, fn); }

onMessage((msg, sender, respond) => {
  if (!authorize(msg, sender)) return;
  hubHandlers.get(msg.type)?.(msg, sender);
});

// ── 1) 중계 ────────────────────────────────────────────────────
function broadcastToPortal(message: object) {
  // 인자: 보낼 메시지. 포털 탭 전부에 전달한다.
}

// ── 2) 탭 오케스트레이션 ───────────────────────────────────────
// 인자: 대상 시스템, 보낼 명령. 탭이 없으면 열고, 있으면 전면으로 가져와 전달한다.
function runOnSystem(system: keyof typeof HOSTS, command: object) {
  const tab = findTab(system);
  if (tab) {
    focus(tab);
    relayOrRecover(tab, command, LABEL[system as 'CASE']);
  } else {
    openTab(system, () => relay(findTab(system)!, command)); // 로드 완료를 기다린 뒤 전송
  }
}

// 인자: 대상 탭, 명령, 시스템 이름. 전달 실패 시 탭을 새로고침하고 사이드바에 알린다.
function relayOrRecover(tab: Tab, command: object, label: string) {
  relay(tab, command).catch(() => {
    reload(tab);
    broadcastToPortal({ type: 'PAGE_EXPIRED', system: label });
  });
}

// ── 3) 세대 카운터 ─────────────────────────────────────────────
// 쓰기가 시작될 때마다 증가한다. 쓰기 시작 이전에 출발한 폴링 응답은 버린다.
let writeGeneration = 0;

// 인자: 응답을 받을 탭 id. 조회 결과를 그 탭에만 보낸다.
function pollClientConfig(tabId: number) {
  if (!hubState.currentLoginId) return;          // 신원 확보 전이면 스킵
  const genAtRequest = writeGeneration;
  fetchWebhookJson(configUrl()).then((data) => {
    if (genAtRequest !== writeGeneration) return; // 낡은 세대 → 폐기
    relay({ id: tabId }, { type: 'CLIENT_CONFIG_UPDATED', config: data });
  });
}

// 게시판 쓰기 경로. 쓰기마다 멱등 키를 붙이고, 재시도는 같은 키로 나간다.
// 인자: 액션명, 본문, 응답 탭 id, 응답 콜백.
function handleBulletinWrite(action: string, payload: object, tabId: number, respond: Respond) {
  writeGeneration += 1;
  fetchWebhookJson(writeUrl(action), { ...payload, idempotencyKey: newIdempotencyKey() })
    .then(() => { respond({ success: true }); pollClientConfig(tabId); }) // 성공 즉시 재폴링
    .catch((err) => respond({ success: false, error: String(err) })); // 실패는 화면에 반영
}

// 인자: URL, 본문, 남은 재시도 횟수. 반환: 파싱된 JSON.
// 네트워크 실패와 파싱 실패를 같은 재시도로 처리한다.
function fetchWebhookJson(url: string, body?: object, retries = 2): Promise<any> {
  return request(url, body).catch((err) => {
    if (retries <= 0) throw err;
    return delay(500).then(() => fetchWebhookJson(url, body, retries - 1));
  });
}

// ── 4) 재기동 복구 ─────────────────────────────────────────────
// 재기동 시 chrome.storage.session에 남은 신원으로 상태를 복원한다.
onServiceWorkerStart(() => {
  readSessionStorage('SPOG_LOGIN_ID').then((id) => { if (id) hubState.currentLoginId = id; });
});

// 유휴 타이머(SECURITY_LOCK)가 만료되면 신원과 진행 상태를 비운다.
onIdle(RPA_APP_CONFIG.TIMEOUT.SECURITY_LOCK, () => {
  hubState = { currentLoginId: '', step: 'idle' };
  clearSessionStorage(['SPOG_LOGIN_ID', 'SPOG_AGENT_NAME']);
});

// ── 자동 연쇄 ──────────────────────────────────────────────────
// 예약 생성이 끝나면 고객 응대 시스템에 응대 메모 반영을 이어서 요청한다.
onHubMessage('DISPATCH_EXECUTE_RESULT', (msg) => {
  if (!msg.success) return;
  runOnSystem('CUSTOMER', { type: 'DO_APPLY_RESERVATION_TO_MEMO', ...msg });
  sendLog({ step: 'dispatch_execute', at: now() });
});

// 인자: 기록할 항목. 결과 로그 웹훅에 전송한다(전달은 best-effort).
function sendLog(entry: object) { /* 결과 로그 웹훅에 POST, 실패해도 흐름은 막지 않음 */ }

// ── 확장 업데이트 안내 ─────────────────────────────────────────
// 업데이트 후 새로고침이 필요한 시스템 목록을 사이드바에 알린다.
// 각 탭이 새로고침되면 목록에서 빼고, 목록이 비면 안내를 닫는다.
onExtensionUpdated(() => {
  const openSystems = ['CASE', 'DISPATCH', 'CUSTOMER'].filter(findTab);
  if (openSystems.length) broadcastToPortal({ type: 'PENDING_REFRESH_STATUS', pending: openSystems });
});

type Tab = { id: number };
type Role = 'portal' | 'case' | 'dispatch' | 'customer';
type Respond = (r?: unknown) => void;
declare function findTab(system: string): Tab | undefined;
declare function openTab(system: string, then: () => void): void;
declare function focus(tab: Tab): void;
declare function relay(tab: Tab, command: object): Promise<void>;
declare function reload(tab: Tab): void;
declare function request(url: string, body?: object): Promise<any>;
declare function delay(ms: number): Promise<void>;
declare function configUrl(): string;
declare function writeUrl(action: string): string;
declare function readSessionStorage(key: string): Promise<string>;
declare function clearSessionStorage(keys: string[]): void;
declare function onIdle(ms: number, fn: () => void): void;
declare function ownExtensionId(): string;
declare function originOf(url?: string): string;
declare function newIdempotencyKey(): string;
declare function onServiceWorkerStart(fn: () => void): void;
declare function onExtensionUpdated(fn: () => void): void;
declare function onMessage(fn: (msg: any, sender: Sender, respond: Respond) => void): void;
declare function now(): string;

// service_worker.ts
// [의사코드] 백그라운드 허브. 네 시스템은 서로를 모르고, 탭끼리 직접 통신하지
// 않는다. 모든 메시지가 이 허브를 지나므로, 시스템을 추가해도 기존 시스템 코드는
// 그대로 둔다.
//
// 이 파일이 담당하는 네 가지:
//   1) 허브 앤 스포크 중계
//   2) 탭 오케스트레이션 — 없으면 열고, 전면으로 보여주고, 끝나면 돌려보낸다
//   3) 낡은 응답 차단 — 세대 카운터
//   4) 자신이 죽었다 살아난 뒤의 상태 복구
//
// 대상 호스트는 전부 로컬 모의 서버다.

const HOSTS = { PORTAL: 8081, CASE: 8082, DISPATCH: 8083, CUSTOMER: 8084 };
const LABEL = { CASE: '케이스 관리 시스템', DISPATCH: '예약·배차 시스템', CUSTOMER: '고객 응대 시스템' };

let hubState = { currentLoginId: '', step: 'idle' };

// ── 1) 중계 ────────────────────────────────────────────────────
function broadcastToPortal(message: object) {
  // 포털 탭 전부에 push. 사이드바는 어느 탭에 있든 같은 상태를 본다.
}

// ── 2) 탭 오케스트레이션 ───────────────────────────────────────
// 대상 탭이 없으면 열고, 있으면 재사용한다. 작업 중인 탭을 전면으로 가져와
// 처리 과정을 보여주고, 끝나면 포털 탭으로 복귀한다.
function runOnSystem(system: keyof typeof HOSTS, command: object) {
  const tab = findTab(system);
  if (tab) {
    focus(tab);
    relayOrRecover(tab, command, LABEL[system as 'CASE']);
  } else {
    openTab(system, () => relay(findTab(system)!, command)); // 로드 완료를 기다린 뒤 전송
  }
}

// 릴레이가 실패하면 탭을 새로고침하고 사이드바에 상태를 알린다.
function relayOrRecover(tab: Tab, command: object, label: string) {
  relay(tab, command).catch(() => {
    reload(tab);
    broadcastToPortal({ type: 'PAGE_EXPIRED', system: label });
  });
}

// ── 3) 세대 카운터 ─────────────────────────────────────────────
// 게시판 쓰기(POST)와 배경 폴링(GET, 5분 알람)은 같은 백엔드를 향하고 순서가
// 보장되지 않는다. 쓰기 시작 이전에 출발한 폴링 응답은 도착해도 버린다.
// 불변식: 화면에 반영되는 값은 항상 마지막 쓰기 이후에 시작된 폴링의 결과다.
let writeGeneration = 0;

function pollClientConfig() {
  if (!hubState.currentLoginId) return;          // 신원 확보 전이면 스킵
  const genAtRequest = writeGeneration;
  fetchWebhookJson(configUrl()).then((data) => {
    if (genAtRequest !== writeGeneration) return; // 낡은 세대 → 폐기
    broadcastToPortal({ type: 'CLIENT_CONFIG_UPDATED', config: data });
  });
}

// 사이드바의 쓰기는 항상 이 경로를 거친다(세대 증가 지점을 한 곳으로 유지).
function handleBulletinWrite(action: string, payload: object, respond: Respond) {
  writeGeneration += 1;
  fetchWebhookJson(writeUrl(action), payload)
    .then(() => { respond({ success: true }); pollClientConfig(); }) // 성공 즉시 재폴링
    .catch((err) => respond({ success: false, error: String(err) })); // 실패는 화면에 반영
}

// 웹훅 런타임은 부하 상황에서 JSON 대신 HTML 에러 페이지를 반환할 수 있다.
// 네트워크 실패와 파싱 실패를 같은 짧은 재시도로 흡수한다. 멱등한 호출에만 적용한다.
function fetchWebhookJson(url: string, body?: object, retries = 2): Promise<any> {
  return request(url, body).catch((err) => {
    if (retries <= 0) throw err;
    return delay(500).then(() => fetchWebhookJson(url, body, retries - 1));
  });
}

// ── 4) 재기동 복구 ─────────────────────────────────────────────
// 재기동 시 storage에 남은 신원으로 상태를 복원하고 한 번 재폴링한다.
onServiceWorkerStart(() => {
  readStorage('SPOG_LOGIN_ID').then((id) => {
    if (id) { hubState.currentLoginId = id; pollClientConfig(); }
  });
});

// 브라우저를 새로 켠 경우(서비스워커 재기동과는 다른 이벤트)에는 신원을 넘기지 않는다.
onBrowserStartup(() => clearStorage(['SPOG_LOGIN_ID', 'SPOG_AGENT_NAME']));

// ── 자동 연쇄 ──────────────────────────────────────────────────
// 예약 생성이 끝나면 사용자 클릭 없이 고객 응대 시스템까지 이어서 반영한다.
// 세 시스템에 걸친 한 건의 업무가 한 번의 조작으로 끝나는 지점이다.
onMessage('DISPATCH_EXECUTE_RESULT', (msg) => {
  if (!msg.success) return;
  runOnSystem('CUSTOMER', { type: 'DO_APPLY_RESERVATION_TO_MEMO', ...msg });
  sendLog({ step: 'dispatch_execute', at: now() });
});

// 각 자동화 스텝은 완료 시 쓰기 전용 로그로 남는다(감사·추적용).
function sendLog(entry: object) { /* 결과 로그 웹훅에 POST, 실패해도 흐름은 막지 않음 */ }

// ── 확장 업데이트 안내 ─────────────────────────────────────────
// 이미 주입된 콘텐츠 스크립트는 페이지 새로고침 시점에 새 버전으로 교체된다.
// 강제 새로고침 대신 안내만 띄우고, 각 탭이 새로고침되면 목록에서 뺀다.
// 목록이 비면 안내를 닫는다.
onExtensionUpdated(() => {
  const openSystems = ['CASE', 'DISPATCH', 'CUSTOMER'].filter(findTab);
  if (openSystems.length) broadcastToPortal({ type: 'PENDING_REFRESH_STATUS', pending: openSystems });
});

type Tab = { id: number };
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
declare function readStorage(key: string): Promise<string>;
declare function clearStorage(keys: string[]): void;
declare function onServiceWorkerStart(fn: () => void): void;
declare function onBrowserStartup(fn: () => void): void;
declare function onExtensionUpdated(fn: () => void): void;
declare function onMessage(type: string, fn: (msg: any) => void): void;
declare function now(): string;

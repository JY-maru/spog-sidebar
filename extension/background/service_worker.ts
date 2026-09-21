// service_worker.ts
// [MOCK] MV3 백그라운드 허브 — 네 개 시스템 탭 사이의 모든 메시지가 이
// 서비스워커를 거쳐 중계된다. 대상 시스템은 전부 로컬 모의 서버이며 실제
// 연동 대상은 이 저장소에 포함되지 않는다.
//
// 두 가지가 이 파일의 핵심이다.
//  - 상태 복원: MV3 서비스워커는 유휴 시 종료·재기동되므로 메모리 상태(로그인
//    식별자 등)를 storage에서 되살린다.
//  - 탭 오케스트레이션: 대상 탭이 없으면 열고, 있으면 재사용하거나 복구한다.

interface BgMessage {
  type: string;
  [key: string]: unknown;
}
type SendResponse = (response?: unknown) => void;

const URL_PATTERNS = Object.freeze({
  PORTAL: 'http://localhost:8081/*',
  CASE: 'http://localhost:8082/*',
  DISPATCH: 'http://localhost:8083/*',
  CUSTOMER: 'http://localhost:8084/*',
});
const SYSTEM_LABEL = Object.freeze({
  CASE: '케이스 관리 시스템',
  DISPATCH: '예약·배차 시스템',
  CUSTOMER: '고객 응대 시스템',
});

const _bgState: { currentLoginId: string } = { currentLoginId: '' };

// ── 탭 전체 브로드캐스트 ──
function broadcastToPortal(message: BgMessage): void {
  chrome.tabs.query({ url: URL_PATTERNS.PORTAL }, (tabs) => tabs.forEach((t) => chrome.tabs.sendMessage(t.id!, message).catch(() => {})));
}

// ── 전산 페이지 만료/세션끊김을 사이드바에 팝업으로 알림 ──
function notifyPageExpired(systemLabel: string, extraText?: string): void {
  broadcastToPortal({ type: 'PAGE_EXPIRED', system: systemLabel, text: extraText || `${systemLabel} 페이지가 만료되었습니다. 재인증이 필요합니다.` });
  console.error(`[SPoG:Background] ERR_PAGE_EXPIRED ${systemLabel} 탭 릴레이 실패`);
}

// ── 열려있는 탭에 명령 릴레이. 릴레이가 실패하면 탭을 새로고침해 정상 화면을
//    다시 띄우고, 사이드바에도 알려 사용자가 원인을 알 수 있게 한다. ──
function relayOrRecover(tabId: number, message: BgMessage, systemLabel: string): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    chrome.tabs.reload(tabId);
    notifyPageExpired(systemLabel);
  });
}

// 대상 시스템 탭에 명령을 릴레이하고, 탭이 아예 없으면 새로 열어서(find-or-create)
// 보낸다 — REQ_* → DO_* 커맨드 맵 변환은 호출부가 넘겨준다.
function makeRelay(
  urlPattern: string,
  systemLabel: string,
  cmdMap: Record<string, string>,
  { createIfMissing = false }: { createIfMissing?: boolean } = {},
) {
  return (message: BgMessage, _sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
    chrome.tabs.query({ url: urlPattern }, (tabs) => {
      const payload = { ...message, type: cmdMap[message.type] || message.type };
      if (tabs.length > 0) {
        relayOrRecover(tabs[0].id!, payload, systemLabel);
      } else if (createIfMissing) {
        chrome.tabs.create({ url: urlPattern.replace('/*', ''), active: false }, (newTab) => {
          chrome.tabs.onUpdated.addListener(function listener(tabId: number, info: chrome.tabs.TabChangeInfo) {
            if (tabId === newTab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(() => chrome.tabs.sendMessage(newTab.id!, payload).catch(() => {}), RPA_APP_CONFIG.TIMEOUT.TAB_CREATE_DELAY);
            }
          });
        });
      } else {
        broadcastToPortal({ type: 'DISPATCH_ERROR', error: `${systemLabel} 탭이 열려있지 않습니다.` });
        notifyPageExpired(systemLabel, `${systemLabel} 탭을 새로 열었습니다. 재인증 후 다시 시도해주세요.`);
        chrome.tabs.create({ url: urlPattern.replace('/*', ''), active: false });
      }
    });
    sendResponse({ status: 'ok' });
    return true;
  };
}

// =========================================================================
// 백엔드 웹훅 fetch + 재시도 — 웹훅 런타임은 부하나 콜드스타트 상황에서 JSON
// 대신 HTML 에러 페이지를 반환할 수 있고, 그때 res.json()이 예외를 던진다.
// 네트워크 실패와 파싱 실패를 같은 짧은 재시도로 흡수한다. 재시도는 멱등성이
// 보장된 호출(조회 전부, mock_sidebar_webhook.js의 쓰기 3종)에만 적용한다.
// =========================================================================
function fetchWebhookJson(url: string, options?: RequestInit, retries = 2, delayMs = 500): Promise<any> {
  return fetch(url, options).then((r) => r.json()).catch((err) => {
    if (retries <= 0) throw err;
    return new Promise<void>((resolve) => setTimeout(resolve, delayMs)).then(() => fetchWebhookJson(url, options, retries - 1, delayMs * 2));
  });
}

// =========================================================================
// 사이드바 중앙 폴링 — 버전/큐권한/공지사항을 백엔드에서 이 한 곳(서비스워커)
// 에서만 가져와 CLIENT_CONFIG_UPDATED로 사이드바에 push한다. 각 콘텐츠 스크립트가
// 제각각 폴링하면 중복 요청이 발생하므로 중앙 집중화했다.
//
// _configWriteGeneration — 게시판 쓰기(고정/읽음/재정렬)가 시작될 때마다 증가한다.
// 쓰기 POST와 폴링 GET은 같은 백엔드를 향하지만 순서가 보장되지 않으므로, 쓰기
// 시작 이전에 나가 있던 폴링 응답은 도착해도 낡은 세대로 판정해 버린다.
// 불변식: 화면에 반영되는 설정은 항상 마지막 쓰기 이후에 시작된 폴링의 결과다.
// =========================================================================
let _configWriteGeneration = 0;

function pollClientConfig(): void {
  if (!_bgState.currentLoginId) return; // 로그인 정보 확보 전이면 스킵
  const url = `${RPA_APP_CONFIG.URL.SIDEBAR_MGMT_WEBHOOK}?action=GET_CLIENT_CONFIG&loginId=${encodeURIComponent(_bgState.currentLoginId)}`;
  const genAtRequest = _configWriteGeneration;
  fetchWebhookJson(url).then((data) => {
    if (genAtRequest !== _configWriteGeneration) {
      console.log('[SPoG:Background] 게시판 쓰기 발생 후 도착한 stale 폴링 응답 폐기');
      return;
    }
    if (data?.status === 'success') broadcastToPortal({ type: 'CLIENT_CONFIG_UPDATED', config: data });
    else console.error('[SPoG:Background] GET_CLIENT_CONFIG 응답 실패:', data);
  }).catch((err) => console.error('[SPoG:Background] GET_CLIENT_CONFIG 요청 실패:', err));
}

// ── 게시판 고정/읽음/재정렬 쓰기 — 사이드바 직접 fetch 대신 여기를 거치게
//    해서 _configWriteGeneration을 올려 폴링과의 경쟁을 차단하고, 성공 직후
//    바로 재폴링해 5분 알람까지 기다리지 않고 빠르게 동기화한다. ──
function _handleBulletinWrite(action: string, extraFields: (msg: BgMessage) => object) {
  return (msg: BgMessage, _sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
    if (msg.type !== action) return false;
    _configWriteGeneration += 1;
    const url = `${RPA_APP_CONFIG.URL.SIDEBAR_MGMT_WEBHOOK}?action=${action}`;
    fetchWebhookJson(url, { method: 'POST', body: JSON.stringify({ loginId: _bgState.currentLoginId, ...extraFields(msg) }) })
      .then((data) => {
        if (data?.status === 'success') { sendResponse({ success: true }); pollClientConfig(); }
        else sendResponse({ success: false, error: data?.message || '백엔드 응답 실패' });
      })
      .catch((err) => sendResponse({ success: false, error: err.toString() }));
    return true;
  };
}
chrome.runtime.onMessage.addListener(_handleBulletinWrite('TOGGLE_BULLETIN_PIN', (m) => ({ bulletinId: m.bulletinId, pinned: m.pinned, pinnedOrder: m.pinnedOrder })) as never);
chrome.runtime.onMessage.addListener(_handleBulletinWrite('TOGGLE_BULLETIN_READ', (m) => ({ bulletinId: m.bulletinId, read: m.read })) as never);
chrome.runtime.onMessage.addListener(_handleBulletinWrite('REORDER_BULLETIN_PINS', (m) => ({ orderedIds: m.orderedIds })) as never);

// ── 게시판 본문 온디맨드 조회 — 순수 조회라 세대 카운터/쓰기 경쟁과 무관,
//    재시도해도 항상 안전 ──
chrome.runtime.onMessage.addListener((msg: BgMessage, _sender, sendResponse) => {
  if (msg.type !== 'GET_BULLETIN_DETAIL') return false;
  const url = `${RPA_APP_CONFIG.URL.SIDEBAR_MGMT_WEBHOOK}?action=GET_BULLETIN_DETAIL&bulletinId=${encodeURIComponent(String(msg.bulletinId))}`;
  fetchWebhookJson(url)
    .then((data) => {
      if (data?.status === 'success') sendResponse({ success: true, content: data.content });
      else sendResponse({ success: false, error: data?.message || '백엔드 응답 실패' });
    })
    .catch((err) => sendResponse({ success: false, error: err.toString() }));
  return true;
});

chrome.alarms.create(RPA_APP_CONFIG.SIDEBAR_SYNC.ALARM_NAME, { periodInMinutes: RPA_APP_CONFIG.SIDEBAR_SYNC.POLL_INTERVAL_MIN });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === RPA_APP_CONFIG.SIDEBAR_SYNC.ALARM_NAME) pollClientConfig(); });

// 유휴 타임아웃 후 재기동되면 메모리 상태가 비어 폴링이 계속 스킵되므로,
// storage에 남아 있는 로그인 식별자로 즉시 복원하고 한 번 재폴링한다.
// (같은 브라우저 세션 안에서도 흔히 일어나는 정상 동작이다.)
chrome.storage.local.get(['SPOG_LOGIN_ID'], (res) => {
  if (res.SPOG_LOGIN_ID && !_bgState.currentLoginId) { _bgState.currentLoginId = res.SPOG_LOGIN_ID; pollClientConfig(); }
});

// onStartup은 브라우저를 새로 켰을 때만 발생한다(서비스워커의 유휴 재기동과는
// 다른 이벤트). 새 브라우저 세션에서는 이전 세션의 신원 정보를 물려받지 않아야
// 하므로 저장된 로그인 식별자를 지운다.
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove(['SPOG_LOGIN_ID', 'SPOG_AGENT_NAME'], () => { _bgState.currentLoginId = ''; });
});

// =========================================================================
// 확장 업데이트 직후 이미 열려 있던 시스템 탭 안내 — 이미 주입된 콘텐츠
// 스크립트는 페이지를 새로고침할 때까지 이전 버전으로 계속 실행된다. 강제
// 새로고침은 작업 중인 화면을 잃게 하므로 하지 않고, "새로고침이 필요한 시스템"
// 안내만 띄운다. 각 탭이 새로고침되면 목록에서 빼고, 목록이 비면 안내를 닫는다.
// =========================================================================
const PENDING_REFRESH_KEY = 'SPOG_PENDING_REFRESH_SYSTEMS';
const REFRESH_TRACK_SYSTEMS = { CASE: SYSTEM_LABEL.CASE, DISPATCH: SYSTEM_LABEL.DISPATCH, CUSTOMER: SYSTEM_LABEL.CUSTOMER };

function _broadcastRefreshStatus(pendingKeys: string[]): void {
  const labels = pendingKeys.map((k) => REFRESH_TRACK_SYSTEMS[k as keyof typeof REFRESH_TRACK_SYSTEMS]).filter(Boolean);
  broadcastToPortal({ type: 'PENDING_REFRESH_STATUS', pending: labels });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install' && details.reason !== 'update') return; // 크롬 자체 업데이트는 해당 없음
  const checks = Object.entries({ CASE: URL_PATTERNS.CASE, DISPATCH: URL_PATTERNS.DISPATCH, CUSTOMER: URL_PATTERNS.CUSTOMER })
    .map(([key, pattern]) => new Promise<string | null>((resolve) => chrome.tabs.query({ url: pattern }, (tabs) => resolve(tabs.length > 0 ? key : null))));
  Promise.all(checks).then((results) => {
    const pending = results.filter((k): k is string => !!k);
    if (pending.length === 0) return;
    chrome.storage.local.set({ [PENDING_REFRESH_KEY]: pending });
    _broadcastRefreshStatus(pending);
  });
});

// onInstalled 시점의 push는 포털 탭도 아직 이전 버전이라 새 메시지 타입을 받지
// 못한다. 포털이 새로고침돼 새 코드로 실행되면 이 요청으로 현재 pending 상태를
// 직접 pull한다.
chrome.runtime.onMessage.addListener((msg: BgMessage, _sender, sendResponse) => {
  if (msg.type !== 'REQUEST_PENDING_REFRESH_STATUS') return false;
  chrome.storage.local.get([PENDING_REFRESH_KEY], (res) => {
    const pending = res[PENDING_REFRESH_KEY] || [];
    if (pending.length > 0) _broadcastRefreshStatus(pending);
    sendResponse({ status: 'ok' });
  });
  return true;
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  chrome.storage.local.get([PENDING_REFRESH_KEY], (res) => {
    const pending: string[] = res[PENDING_REFRESH_KEY] || [];
    if (pending.length === 0) return;
    const matchedKey = Object.entries({ CASE: URL_PATTERNS.CASE, DISPATCH: URL_PATTERNS.DISPATCH, CUSTOMER: URL_PATTERNS.CUSTOMER })
      .find(([, pattern]) => tab.url!.startsWith(pattern.replace('/*', '')))?.[0];
    if (!matchedKey || !pending.includes(matchedKey)) return;
    const next = pending.filter((k: string) => k !== matchedKey);
    chrome.storage.local.set({ [PENDING_REFRESH_KEY]: next });
    _broadcastRefreshStatus(next);
  });
});

// =========================================================================
// 결과 로그 시트 기록 — 각 자동화 스텝 완료마다 쓰기 전용으로 기록(감사/추적용)
// =========================================================================
function sendLog(entry: Record<string, unknown>): void {
  fetch(RPA_APP_CONFIG.URL.RESULT_LOG_WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
  }).catch((err) => console.error('[SPoG:Background] 로그 기록 실패:', err));
}

// =========================================================================
// 명령 릴레이 등록
// =========================================================================
const _dispatchRelay = makeRelay(URL_PATTERNS.DISPATCH, SYSTEM_LABEL.DISPATCH, {
  REQ_DISPATCH_RES_INFO: 'DO_DISPATCH_RES_INFO',
  REQ_DISPATCH_BLOCK_INFO: 'DO_DISPATCH_BLOCK_INFO',
  REQ_DISPATCH_EXECUTE: 'DO_DISPATCH_EXECUTE',
  REQ_CANDIDATE_SEARCH_START: 'DO_CANDIDATE_SEARCH_START',
  REQ_CANDIDATE_SEARCH_RESET: 'DO_CANDIDATE_SEARCH_RESET',
  REQ_CANDIDATE_SEARCH_STOP: 'DO_CANDIDATE_SEARCH_STOP',
  REQ_CANDIDATE_SEARCH_EXPAND: 'DO_CANDIDATE_SEARCH_EXPAND',
  REQ_CREATE_RESERVATION_BLOCK: 'DO_CREATE_RESERVATION_BLOCK',
});
['REQ_DISPATCH_RES_INFO', 'REQ_DISPATCH_BLOCK_INFO', 'REQ_DISPATCH_EXECUTE',
  'REQ_CANDIDATE_SEARCH_START', 'REQ_CANDIDATE_SEARCH_RESET', 'REQ_CANDIDATE_SEARCH_STOP', 'REQ_CANDIDATE_SEARCH_EXPAND',
  'REQ_CREATE_RESERVATION_BLOCK'].forEach((type) => chrome.runtime.onMessage.addListener((msg: BgMessage, sender, sendResponse) => {
  if (msg.type !== type) return false;
  return _dispatchRelay(msg, sender, sendResponse);
}));

// 대상 시스템 → 사이드바 결과/진행상황 중계 (그대로 broadcast)
['DISPATCH_RES_INFO', 'DISPATCH_BLOCK_INFO', 'DISPATCH_EXECUTE_RESULT',
  'CANDIDATE_SEARCH_PROGRESS', 'CANDIDATE_SEARCH_RESULT', 'CANDIDATE_SEARCH_ERROR', 'RESERVATION_BLOCK_CREATED',
].forEach((type) => chrome.runtime.onMessage.addListener((msg: BgMessage, _sender, sendResponse) => {
  if (msg.type !== type) return false;
  broadcastToPortal(msg);
  sendResponse({ status: 'ok' });
  return true;
}));

// 자동 연쇄: 예약 생성이 끝나면 사용자 개입 없이 고객 응대 시스템 탭을 방문해
// 응대 메모에도 정보를 반영한다.
chrome.runtime.onMessage.addListener((msg: BgMessage) => {
  if (msg.type !== 'DISPATCH_EXECUTE_RESULT' || !msg.success) return false;
  chrome.tabs.query({ url: URL_PATTERNS.CUSTOMER }, (tabs) => {
    if (tabs.length > 0) relayOrRecover(tabs[0].id!, { type: 'DO_APPLY_RESERVATION_TO_MEMO', ...msg }, SYSTEM_LABEL.CUSTOMER);
  });
  sendLog({ step: 'dispatch_execute', ...msg, at: new Date().toISOString() });
  return false;
});

chrome.runtime.onMessage.addListener((msg: BgMessage) => {
  if (msg.type === 'INTERCEPTED_AGENT_INFO') {
    _bgState.currentLoginId = String(msg.loginId ?? '');
    chrome.storage.local.set({ SPOG_LOGIN_ID: _bgState.currentLoginId, SPOG_AGENT_NAME: msg.managerName });
    pollClientConfig(); // 로그인 직후 첫 데이터는 알람을 기다리지 않고 즉시 확보
    return false;
  }
  if (msg.type === 'INTERCEPTED_CASE') {
    broadcastToPortal(msg);
    sendLog({ step: 'case_created', caseId: msg.caseId, at: new Date().toISOString() });
    return false;
  }
  if (msg.type === 'INBOUND_CALLBACK_ARRIVED' || msg.type === 'INBOUND_CALLBACK_COUNT_UPDATE' || msg.type === 'SEND_CASE_TO_PORTAL') {
    broadcastToPortal(msg);
    return false;
  }
  return false;
});

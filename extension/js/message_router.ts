// message_router.ts
// [MOCK] 포털 콘텐츠 스크립트의 메시지 허브.
//   1) zod 스키마 기반 타입드 메시지 레지스트리 — chrome.runtime.onMessage /
//      window.postMessage 호출부가 흩어져 있던 원본 구조를, 스키마 검증 +
//      오리진 검증 + 타임아웃 가드를 한 곳에서 담당하는 팩토리로 통일한 형태.
//   2) 임베드 폼(iframe) ↔ 케이스 관리 시스템 API 응답 교차검증 — 사이드바가
//      "케이스 연결됨"으로 표시하기 전에 반드시 통과해야 하는 방어 로직.
// 실제 함수/타입 이름은 mock 네이밍으로 치환했고, 도메인 URL/한글 고유명사는
// 전부 제거했습니다. 실제 원본은 이 레이어 전체가 TypeScript + zod로 작성돼
// 있고, 레거시 콘텐츠스크립트는 이 모듈이 만든 window.MessageRouter 파사드를
// 무수정으로 계속 호출한다 — state 레이어와 동일한 점진적 이관 구조.
import { z } from 'zod';

// =========================================================================
// 1. 오리진 검증 — 이 파일이 다루는 채널은 세 종류.
//    a) 'self' — 페이지 메인 월드(injected_*.js) ↔ 콘텐츠 스크립트. 콘텐츠
//       스크립트는 항상 자신이 주입된 페이지와만 통신하므로 자기 origin
//       비교로 충분하다.
//    b) 'embed-sandbox' — 포털이 서빙하는 임베드 폼 iframe은 포털 자신의
//       origin이 아니라 별도 샌드박스 도메인에서 렌더링되므로 suffix로
//       검증해야 한다.
//    c) 'trusted-list' — manifest의 host_permissions/content_scripts
//       matches와 대응되는 화이트리스트 기반 검증(위 두 경우에 안 맞는
//       일반적인 신뢰 origin 확인용).
// 검증 로직은 호출부마다 인라인으로 다시 쓰지 않고 이 한 곳에만 둔다.
// 검증을 통과하지 않은 메시지는 어떤 핸들러에도 도달하지 않는다.
// =========================================================================
const EMBED_SANDBOX_SUFFIX = '.mock-embed-sandbox.local';

/** manifest.json의 host_permissions/content_scripts matches와 대응되는
 *  신뢰 출처 화이트리스트 (mock 도메인으로 일반화). */
const TRUSTED_ORIGINS: readonly string[] = Object.freeze([
  'http://localhost:8081', // 포털 (포털)
  'http://localhost:8082', // 케이스 관리 시스템 (케이스 관리)
  'http://localhost:8083', // 예약·배차 시스템 (예약·배차)
  'http://localhost:8084', // 고객 응대 시스템 (고객 응대)
  'http://localhost:8085', // 주소 검색 위젯류 서드파티 도메인 (일반화)
]);

function isSelfOrigin(origin?: string | null): boolean {
  return !!origin && origin === window.location.origin;
}
function isEmbedSandboxOrigin(origin?: string | null): boolean {
  return !!origin && origin.endsWith(EMBED_SANDBOX_SUFFIX);
}
function isTrustedOrigin(origin?: string | null): boolean {
  return !!origin && TRUSTED_ORIGINS.includes(origin);
}

type PostOriginMode = 'self' | 'embed-sandbox' | 'trusted-list';

function validatePostOrigin(event: MessageEvent, mode: PostOriginMode): boolean {
  switch (mode) {
    case 'self': return isSelfOrigin(event.origin);
    case 'embed-sandbox': return isEmbedSandboxOrigin(event.origin);
    case 'trusted-list': return isTrustedOrigin(event.origin);
  }
}

// =========================================================================
// 2. 메시지 스키마 — 이 파일이 주고받는 모든 타입의 zod 스키마. 단일 진실
//    공급원. type 판별자는 항상 z.literal()로 엄격하게 검증하고(오타/미등록
//    타입을 여기서 잡아내는 게 핵심), payload 필드는 실제로 읽는 것만 타입을
//    주고 나머지는 .passthrough()로 통과시킨다 — 필드 전부를 추측해서 strict
//    하게 걸면 정상 메시지를 오탐으로 거부하는 회귀 위험이 있기 때문이다.
// =========================================================================
const msg = <T extends string>(type: T) => z.object({ type: z.literal(type) });
const loose = <T extends string>(type: T) => msg(type).passthrough();

const InterceptedCase = msg('INTERCEPTED_CASE').extend({ caseId: z.union([z.string(), z.number()]) }).passthrough();
const ClientConfigUpdated = msg('CLIENT_CONFIG_UPDATED').extend({ config: z.record(z.unknown()) });
const DispatchResInfo = loose('DISPATCH_RES_INFO');
const DispatchBlockInfo = loose('DISPATCH_BLOCK_INFO');
const CandidateSearchResult = loose('CANDIDATE_SEARCH_RESULT');
const CandidateSearchProgress = loose('CANDIDATE_SEARCH_PROGRESS');
const CandidateSearchError = loose('CANDIDATE_SEARCH_ERROR');
const InboundCallbackArrived = loose('INBOUND_CALLBACK_ARRIVED');
const ScanBatchComplete = msg('SCAN_BATCH_COMPLETE');
const ScanAlert = msg('SCAN_ALERT').extend({ text: z.string() }).passthrough();
const CaseFormData = loose('CASE_FORM_DATA');

// =========================================================================
// 3. 타입드 메시지 레지스트리 — 여러 다른 디스패치 패턴(if/else 체인, 객체맵,
//    switch)을 하나로 통일. 같은 type을 두 번 등록하면 로드 시점에 즉시
//    에러를 던진다 — 중복 등록은 로드 시점에 드러나야 한다.
//    Map은 globalThis에 지연 생성 싱글턴으로 둔다 —
//    콘텐츠스크립트가 여러 번들 청크로 쪼개져도 항상 같은 인스턴스를
//    공유해야 하기 때문이다(state 레이어의 window.ResourceStore와 동일한 이유).
// =========================================================================
interface RuntimeEntry { schema: z.ZodTypeAny; handler: (msg: any, sender: any, sendResponse: (r?: any) => void) => any; }
interface PostEntry { schema: z.ZodTypeAny; handler: (data: any, source: any) => void; }

const runtimeHandlers: Map<string, RuntimeEntry> = ((globalThis as any).__spogRuntimeHandlers ??= new Map());
const postHandlers: Map<string, PostEntry> = ((globalThis as any).__spogPostHandlers ??= new Map());

function registerRuntimeHandler(type: string, schema: z.ZodTypeAny, handler: RuntimeEntry['handler']): void {
  if (runtimeHandlers.has(type)) throw new Error(`[Messaging] 중복 등록된 타입: "${type}"`);
  runtimeHandlers.set(type, { schema, handler });
}
function registerPostHandler(type: string, schema: z.ZodTypeAny, handler: PostEntry['handler']): void {
  if (postHandlers.has(type)) throw new Error(`[Messaging] 중복 등록된 postMessage 타입: "${type}"`);
  postHandlers.set(type, { schema, handler });
}

const DEFAULT_TIMEOUT_MS = 20000;

// mode: 'respond'(호출자가 응답을 기다림 — 타임아웃/중복응답 가드 적용) |
//       'notify'(fire-and-forget — 알림성 메시지에 타임아웃을 걸면 스팸 에러만
//        남으므로 생략)
function createRuntimeListener({ timeoutMs = DEFAULT_TIMEOUT_MS, mode = 'respond' as 'respond' | 'notify' } = {}) {
  return (message: any, sender: any, sendResponse: (r?: any) => void): boolean => {
    const entry = runtimeHandlers.get(message?.type);
    if (!entry) {
      if (mode === 'respond') sendResponse({ status: 'error', msg: `Unknown type: ${message?.type}` });
      return false;
    }
    const parsed = entry.schema.safeParse(message);
    if (!parsed.success) {
      console.error(`[Messaging] invalid payload for "${message.type}"`, parsed.error.format());
      if (mode === 'respond') sendResponse({ status: 'error', msg: 'invalid payload' });
      return false;
    }
    if (mode === 'notify') {
      try { entry.handler(parsed.data, sender, () => {}); }
      catch (err) { console.error(`[Messaging] handler threw for "${message.type}"`, err); }
      return false;
    }

    let responded = false;
    const timer = setTimeout(() => {
      if (responded) return;
      responded = true;
      sendResponse({ status: 'error', msg: `timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    const guardedSendResponse = (response?: any) => {
      if (responded) return;
      responded = true;
      clearTimeout(timer);
      sendResponse(response);
    };
    try {
      const maybePromise: any = entry.handler(parsed.data, sender, guardedSendResponse);
      if (maybePromise?.catch) maybePromise.catch((err: any) => guardedSendResponse({ status: 'error', msg: String(err) }));
    } catch (err) {
      guardedSendResponse({ status: 'error', msg: String(err) });
    }
    return true; // 응답은 guardedSendResponse가 책임지므로 채널은 항상 열어둔다
  };
}

// window.addEventListener('message', ...)에 그대로 넘길 리스너. 오리진 검증은
// 항상 이 팩토리가 선행 수행한다.
function createPostListener(originMode: PostOriginMode) {
  return (event: MessageEvent) => {
    if (!validatePostOrigin(event, originMode)) return;
    const entry = postHandlers.get((event.data as any)?.type);
    if (!entry) return; // 등록 안 된 타입은 조용히 무시(원본 동작과 동일)
    const parsed = entry.schema.safeParse(event.data);
    if (!parsed.success) {
      console.error(`[Messaging] invalid postMessage payload for "${(event.data as any).type}"`, parsed.error.format());
      return;
    }
    entry.handler(parsed.data, event.source);
  };
}

/** postMessage 우회 없이 등록된 post 핸들러를 직접 호출하는 헬퍼. 등록 안 된
 *  타입을 호출하면(설정 실수) 에러를 던져 조용히 무시되지 않게 한다. */
function invokePostHandler(type: string, data: any): void {
  const entry = postHandlers.get(type);
  if (!entry) throw new Error(`[Messaging] invokePostHandler: 등록되지 않은 타입 "${type}"`);
  const parsed = entry.schema.safeParse({ type, ...data });
  if (!parsed.success) {
    console.error(`[Messaging] invalid payload for direct-invoked "${type}"`, parsed.error.format());
    return;
  }
  entry.handler(parsed.data, null);
}

// =========================================================================
// 4. 임베드 폼 ↔ 케이스 관리 시스템 API 교차검증 — 케이스 카드가 실제로 지금 이 화면의
//    폼과 같은 건인지 대조한 다음에만 "연결됨"으로 표시한다.
//    확인 불가(타임아웃)도 불일치와 같게 취급해 차단한다 — fail-closed.
// =========================================================================
async function getEmbedFormData(kind: string) {
  const frame = window.StateManager.get('targetEmbedFrame') || document.querySelector('iframe');
  if (!frame) return null;
  return await requestFromFrame(frame, kind, /* timeoutMs */ 2000); // 구현 생략: postMessage 왕복
}
declare function requestFromFrame(frame: any, kind: string, timeoutMs: number): Promise<any>;

async function handleInterceptedCase(msg: any) {
  window.UiController.updateStatus('데이터 교차 검증 중...');
  const formData = await getEmbedFormData('ITEMIZED');

  if (formData) {
    const formCaseId = String(formData.caseId || '').trim();
    const formResourceId = String(formData.resourceId || '').replace(/\s/g, '');
    const apiCaseId = String(msg.apiCaseId || '').trim();
    const apiResourceId = String(msg.apiResourceId || '').replace(/\s/g, '');

    let conflict = false;
    if (formCaseId && apiCaseId && formCaseId !== apiCaseId) conflict = true;
    if (formResourceId && apiResourceId && !formResourceId.includes(apiResourceId) && !apiResourceId.includes(formResourceId)) conflict = true;
    // API가 연결 정보 없음(둘 다 빈값)인데 폼엔 값이 남아있으면 이전 세션 잔여물일
    // 위험 — 안전 쪽으로 기본값을 잡아 이것도 충돌로 취급한다.
    if (!apiCaseId && !apiResourceId && (formCaseId || formResourceId)) conflict = true;
    // 반대 방향(API엔 값이 있는데 폼은 비어있음)도 "확인 불가"와 동급으로 막는다 —
    // 비교할 대상이 없다고 그냥 통과시키면 방금 생성된 카드가 빈 폼 상태로도 연결된다.
    if ((apiCaseId && !formCaseId) || (apiResourceId && !formResourceId)) conflict = true;

    if (conflict) {
      console.warn(`[Router] 데이터 불일치 (API: ${apiCaseId}/${apiResourceId} vs 폼: ${formCaseId}/${formResourceId})`);
      window.Panels.caseActions.applyMismatch();
      return; // 검증 실패 시 즉시 중단
    }
  } else if (window.StateManager.get('targetEmbedFrame') || document.querySelectorAll('iframe').length > 0) {
    // 대조할 iframe이 있는데 응답을 못 받은 경우 = 확인 불가 = 차단 (iframe 자체가
    // 없는 정상 상황과는 구분한다)
    console.warn('[Router] 임베드 폼 조회 실패(타임아웃) — 대조 불가로 연결 차단');
    window.Panels.caseActions.applyMismatch();
    return;
  }

  // 검증 통과 — 이전 케이스와 다른 카드가 들어왔으면 상태부터 초기화
  const prevId = (window.StateManager.get('activeCaseInfo') as any)?.id;
  if (prevId && prevId !== msg.caseId) {
    window.UiController.clearSecurityTimer();
    window.StateManager.resetCaseInfo();
    window.Panels.caseActions.clearRecipientsForNewCard();
  }

  window.Panels.caseActions.setConnected(`ID: ${msg.caseId}`);
  window.StateManager.update('activeCaseInfo', {
    id: msg.caseId,
    coverageOption: msg.coverageOption,
    isUrgent: msg.isUrgent,
    isPlanned: msg.isPlanned ?? null,
  });
  window.UiController.updateStatus(`케이스 연결됨 (ID: ${msg.caseId})`, msg.isUrgent ? 'error' : 'success');
  window.UiController.startSecurityTimer(); // 연결 시점부터 카운트다운 — 방치된 세션 자동 잠금

  if (msg.recipientList) window.UiController.renderRecipientList(msg.recipientList);
}

// =========================================================================
// 5. 사이드바 중앙 폴링 응답 반영 — 백그라운드(service_worker.ts)가 대신
//    가져온 설정을 push한 것을 받아 공지사항/버전배너/알림채널 권한을 갱신한다.
// =========================================================================
function handleClientConfigUpdated(msg: any) {
  const cfg = msg.config;
  window.Panels.inboundActions.setAnnouncements(cfg.announcements, cfg.loginId);
  if (cfg.latestVersion) window.UiController.showVersionBanner(cfg.latestVersion, cfg.driveFileVerified);
  window.StateManager.set('notificationChannelToggleEnabled', cfg.notificationChannelToggleEnabled !== false); // fail-open 기본값
}

// =========================================================================
// 6. 초기화 — 모든 핸들러 등록
// =========================================================================
function init(): void {
  registerRuntimeHandler('INTERCEPTED_CASE', InterceptedCase, handleInterceptedCase);
  registerRuntimeHandler('CLIENT_CONFIG_UPDATED', ClientConfigUpdated, handleClientConfigUpdated);
  registerRuntimeHandler('DISPATCH_RES_INFO', DispatchResInfo, (m) => window.Panels.dispatchActions.setResInfo(m));
  registerRuntimeHandler('DISPATCH_BLOCK_INFO', DispatchBlockInfo, (m) => window.Panels.dispatchActions.setBlockInfo(m));
  registerRuntimeHandler('CANDIDATE_SEARCH_RESULT', CandidateSearchResult, (m) => window.Panels.dispatchActions.setSearchResult(m));
  registerRuntimeHandler('CANDIDATE_SEARCH_PROGRESS', CandidateSearchProgress, (m) => window.Panels.dispatchActions.setSearchProgress(m));
  registerRuntimeHandler('CANDIDATE_SEARCH_ERROR', CandidateSearchError, (m) => window.Panels.dispatchActions.setSearchError(m));
  registerRuntimeHandler('INBOUND_CALLBACK_ARRIVED', InboundCallbackArrived, (m) => window.Panels.inboundActions.memberArrived(m));
  registerRuntimeHandler('SCAN_BATCH_COMPLETE', ScanBatchComplete, () => window.Panels.postcareActions.onScanBatchComplete());
  registerRuntimeHandler('SCAN_ALERT', ScanAlert, (m) => window.Panels.postcareActions.showScanAlert(m.text, m.color));

  chrome.runtime.onMessage.addListener(createRuntimeListener({ mode: 'notify' }));

  registerPostHandler('CASE_FORM_DATA', CaseFormData, (data) => {
    window.StateManager.set('latestEmbedFormData', { caseId: data.caseId, resourceId: data.resourceId });
  });
  window.addEventListener('message', createPostListener('embed-sandbox'));
}

declare global {
  interface Window {
    MessageRouter: { init: typeof init; registerRuntimeHandler: typeof registerRuntimeHandler; registerPostHandler: typeof registerPostHandler; invokePostHandler: typeof invokePostHandler };
  }
}
window.MessageRouter = { init, registerRuntimeHandler, registerPostHandler, invokePostHandler };

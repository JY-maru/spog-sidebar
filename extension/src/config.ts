// config.ts
// [의사코드] 콘텐츠 스크립트와 서비스워커가 공유하는 상수.
// 모든 주소는 로컬 모의 서버를 가리킨다 — 실제 연동 대상은 이 저장소에 없다.
//
// [빌드 제약] 이 파일은 content_scripts 목록의 첫 항목으로 로드되고, 뒤따르는
// 스크립트들이 전역을 동기적으로 읽는다. 엔트리에 import 문이 있으면 번들러
// (crxjs 등)가 비동기 로더로 변환하므로, 이 모듈만은 import 없이 작성하고
// IIFE로 선번들해 동기 로드를 보장한다. 타입은 globals.d.ts의 declare global로
// 공유한다.

export interface AppConfig {
  readonly URL: Readonly<Record<'DISPATCH_RESERVATION' | 'SIDEBAR_MGMT_WEBHOOK' | 'RESULT_LOG_WEBHOOK', string>>;
  readonly TIMEOUT: Readonly<Record<'ELEMENT_DEFAULT' | 'ELEMENT_LONG' | 'WIDGET_INJECT' | 'TAB_CREATE_DELAY' | 'SECURITY_LOCK', number>>;
  readonly SIDEBAR_SYNC: { readonly ALARM_NAME: string; readonly POLL_INTERVAL_MIN: number };
  readonly STORAGE_KEY: { readonly LAST_SYNC_TIME: string };
  readonly TONE: Readonly<Record<'success' | 'error' | 'warning' | 'info' | 'pending', { icon: string; color: string }>>;
}

export interface AppUtils {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const RPA_APP_CONFIG: AppConfig = Object.freeze({
  URL: Object.freeze({
    DISPATCH_RESERVATION: 'http://localhost:8083/reservation', // 탭이 없을 때 새로 열 진입 URL
    SIDEBAR_MGMT_WEBHOOK: 'http://localhost:8086/sidebar-webhook', // 공지·버전·권한 조회
    RESULT_LOG_WEBHOOK: 'http://localhost:8085/log', // 자동화 결과 기록(쓰기 전용)
  }),

  TIMEOUT: Object.freeze({
    ELEMENT_DEFAULT: 3000,
    ELEMENT_LONG: 8000, // 목록 렌더가 느린 화면용
    WIDGET_INJECT: 400,
    TAB_CREATE_DELAY: 1500, // 새 탭 로드 후 콘텐츠 스크립트가 붙을 여유
    SECURITY_LOCK: 30000, // 입력이 없으면 케이스 연결 자동 해제
  }),

  SIDEBAR_SYNC: Object.freeze({
    ALARM_NAME: 'spog-sidebar-sync',
    POLL_INTERVAL_MIN: 5, // chrome.alarms가 허용하는 최소 주기(분)
  }),

  STORAGE_KEY: Object.freeze({ LAST_SYNC_TIME: 'SPOG_LAST_SYNC_TIME' }),

  // 톤 ↔ 아이콘·색 매핑을 이 한 곳에서만 파생시킨다
  TONE: Object.freeze({
    success: { icon: '✓', color: '#22C55E' },
    error: { icon: '✕', color: '#EF4444' },
    warning: { icon: '⚠️', color: '#F59E0B' },
    info: { icon: 'ℹ️', color: '#3B82F6' },
    pending: { icon: '…', color: '#94A3B8' },
  }),
});

const RPA_UTILS: AppUtils = {
  log: (...args) => console.log('[SPoG]', ...args),
  warn: (...args) => console.warn('[SPoG]', ...args),
  error: (...args) => console.error('[SPoG]', ...args),
};

// 오리진 판정은 message_router.ts의 레지스트리가 전담한다.

// 레거시 스크립트가 import 없이 참조할 수 있도록 전역에 심는다.
// 서비스워커에는 window가 없으므로 globalThis를 쓴다.
Object.assign(globalThis, { RPA_APP_CONFIG, RPA_UTILS });

// config.ts
// [MOCK] 모든 콘텐츠 스크립트와 서비스워커가 공유하는 설정/유틸 모듈.
// 이 저장소는 동작하는 제품이 아니라 아키텍처를 보여주기 위한 모형이며,
// 아래 URL은 전부 로컬 모의 서버(localhost:8081~8086)를 가리킨다.
//
// [빌드 제약] 이 파일은 content_scripts 목록의 첫 항목으로 로드된다. 엔트리에
// import 문이 하나라도 있으면 번들러(crxjs 등)가 이를 비동기 로더로 바꾸기
// 때문에, 뒤따르는 스크립트가 전역을 읽는 시점과 경쟁이 생긴다. 그래서 이
// 모듈은 import 없이 작성하고 IIFE로 선번들해 동기 로드를 보장한다.

type ToneName = 'success' | 'error' | 'warning' | 'info' | 'pending';

export interface AppConfig {
  readonly URL: {
    readonly DISPATCH_RESERVATION: string;
    readonly SIDEBAR_MGMT_WEBHOOK: string;
    readonly RESULT_LOG_WEBHOOK: string;
  };
  readonly TIMEOUT: {
    readonly ELEMENT_DEFAULT: number;
    readonly ELEMENT_LONG: number;
    readonly WIDGET_INJECT: number;
    readonly TAB_CREATE_DELAY: number;
    readonly SECURITY_LOCK: number;
  };
  readonly SIDEBAR_SYNC: { readonly ALARM_NAME: string; readonly POLL_INTERVAL_MIN: number };
  readonly STORAGE_KEY: { readonly LAST_SYNC_TIME: string };
  readonly TONE: Readonly<Record<ToneName, { readonly icon: string; readonly color: string }>>;
}

export interface AppUtils {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const RPA_APP_CONFIG: AppConfig = Object.freeze({
  URL: Object.freeze({
    // 예약·배차 시스템의 예약 화면 — 해당 탭이 없을 때 새로 열기 위한 진입 URL
    DISPATCH_RESERVATION: 'http://localhost:8083/reservation',
    // 사이드바 관리용 백엔드 웹훅(공지사항/버전/큐권한 조회)
    SIDEBAR_MGMT_WEBHOOK: 'http://localhost:8086/sidebar-webhook',
    RESULT_LOG_WEBHOOK: 'http://localhost:8085/log',
  }),

  TIMEOUT: Object.freeze({
    ELEMENT_DEFAULT: 3000,
    ELEMENT_LONG: 8000,
    WIDGET_INJECT: 400,
    TAB_CREATE_DELAY: 1500,
    SECURITY_LOCK: 30000,
  }),

  SIDEBAR_SYNC: Object.freeze({
    ALARM_NAME: 'spog-sidebar-sync',
    POLL_INTERVAL_MIN: 5, // chrome.alarms가 허용하는 최소 주기(분)
  }),

  STORAGE_KEY: Object.freeze({
    LAST_SYNC_TIME: 'SPOG_LAST_SYNC_TIME',
  }),

  // 토스트/상태바 톤 ↔ 아이콘·색 매핑을 이 한 곳에서만 파생시킨다
  TONE: Object.freeze({
    success: { icon: '✓', color: '#22C55E' },
    error: { icon: '✕', color: '#EF4444' },
    warning: { icon: '⚠️', color: '#F59E0B' },
    info: { icon: 'ℹ️', color: '#3B82F6' },
    pending: { icon: '…', color: '#94A3B8' },
  }),
});

// 오리진 검증은 message_router.ts의 중앙 레지스트리가 전담한다. 검증 함수를
// 이 모듈에도 두면 호출부가 어느 쪽을 쓰는지 흐려지므로 여기엔 두지 않는다.

export function getOneMonthAgoDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d;
}

export function getCurrentTimeStr(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

const RPA_UTILS: AppUtils = {
  log: (...args) => console.log('[SPoG]', ...args),
  warn: (...args) => console.warn('[SPoG]', ...args),
  error: (...args) => console.error('[SPoG]', ...args),
};

// 레거시 콘텐츠 스크립트가 import 없이 참조할 수 있도록 전역에 심는다.
// 서비스워커에는 window가 없으므로 globalThis를 쓴다.
Object.assign(globalThis, { RPA_APP_CONFIG, RPA_UTILS });

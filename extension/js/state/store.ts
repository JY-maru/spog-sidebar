// state/store.ts
// [MOCK] state_manager.js(구 버전 vanilla 전역객체)를 대체하는 실제
// Zustand 스토어. 필드 개수·의미는 원본과 동일하게 유지했고, 이름만 업종
// 중립 용어로 일반화했다. subscribe()는 이 스토어에서 "처음" 생긴 기능 —
// 이전 vanilla 버전엔 구독 개념 자체가 없었다.
//
// targetEmbedFrame은 직렬화 불가한 살아있는 iframe.contentWindow 참조이므로
// persist 대상이 아니다(새로고침 시 초기화되는 순수 메모리 상태 — 원본 동작
// 그대로 유지).
import { createStore } from 'zustand/vanilla';

export interface ActiveCaseInfo {
  id: string | number | null;
  coverageOption: string;
  isUrgent: boolean;
  isPlanned: boolean | null;
  isReturnOverdue: boolean;
  overdueEndAt: string;
}

export interface SharedState {
  /** 케이스 연동 정보 (케이스 관리 시스템 접수 카드와의 연결 상태) */
  activeCaseInfo: ActiveCaseInfo;
  /** 임베드 폼(iframe)에서 받은 최신 원문 페이로드 */
  latestEmbedFormData: { resId: string | null; resourceId: string | null };
  /** 리소스 ID 캐시 (URL 생성 최적화) */
  cachedResourceId: string | number | null;
  /** cachedResourceId가 어느 표시번호의 것인지 추적 (stale 캐시 검증용) */
  cachedResourceDisplayId: string | null;
  /** 자동화 처리 진행 여부 */
  isWaitingForAutomationResult: boolean;
  /** 현재 자동화가 처리 중인 예약번호 */
  activeReservationIdForAutomation: string | null;
  /** 임베드 폼 직통 채널 — 직렬화 불가한 라이브 참조 */
  targetEmbedFrame: Window | MessagePort | null;
  /** 알림 수신 대상 목록 */
  globalRecipientList: unknown[];
  /** 알림 채널 온오프 스위치 사용 가능 여부 (기본값 true = fail-open) */
  notificationChannelToggleEnabled: boolean;
}

function defaultCaseInfo(): ActiveCaseInfo {
  return {
    id: null,
    coverageOption: '',
    isUrgent: false,
    isPlanned: false,
    isReturnOverdue: false,
    overdueEndAt: '',
  };
}

const initialState: SharedState = {
  activeCaseInfo: defaultCaseInfo(),
  latestEmbedFormData: { resId: null, resourceId: null },
  cachedResourceId: null,
  cachedResourceDisplayId: null,
  isWaitingForAutomationResult: false,
  activeReservationIdForAutomation: null,
  targetEmbedFrame: null,
  globalRecipientList: [],
  notificationChannelToggleEnabled: true,
};

export const sharedStore = createStore<SharedState>(() => initialState);

/** 케이스 연동 상태 전체 초기화 (연결 해제 버튼 클릭 시 사용).
 *  구 버전의 resetCaseInfo()와 동일한 4개 필드만 리셋한다. */
export function resetCaseInfo(): void {
  sharedStore.setState({
    activeCaseInfo: defaultCaseInfo(),
    activeReservationIdForAutomation: null,
    isWaitingForAutomationResult: false,
    globalRecipientList: [],
  });
}

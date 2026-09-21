// state/legacy_adapter.ts
// [MOCK] 구 window.StateManager(vanilla 전역객체)의 정확한 재현 —
// get/set/update/resetCaseInfo, 그리고 오타 가드(_knownKeys)까지 원본과
// 동일하게 동작한다.
//
// 이 파사드가 존재하는 이유: message_router.ts(수십 곳)와 ui_controller.js
// (수십 곳)의 기존 호출부를 한꺼번에 바꾸지 않기 위함. 그 두 파일은 계속
// 이 파사드를 무수정으로 호출하고, React로 이전된 패널 컴포넌트만
// store.ts의 진짜 sharedStore를 훅으로 직접 사용한다. 점진적 마이그레이션의
// 핵심 이음매.
import { sharedStore, resetCaseInfo as resetCaseInfoImpl, type SharedState } from './store';

type StateKey = keyof SharedState;

const _knownKeys = new Set<string>(Object.keys(sharedStore.getState()));

function _guard(key: string): void {
  if (!_knownKeys.has(key)) {
    // RPA_UTILS는 config.ts가 이 컨텍스트에 이미 심어둔 전역
    (globalThis as any).RPA_UTILS?.warn(`[StateManager] ⚠️ 알 수 없는 상태 키: "${key}" — 오타 확인 필요`);
  }
}

export const legacyStateManager = {
  /** 상태 값 읽기 */
  get(key: string): unknown {
    _guard(key);
    return sharedStore.getState()[key as StateKey];
  },

  /** 상태 값 전체 교체 */
  set(key: string, value: unknown): void {
    _guard(key);
    sharedStore.setState({ [key]: value } as Partial<SharedState>);
  },

  /** 객체 상태를 부분 업데이트 (스프레드 병합)
   *  예: StateManager.update('activeCaseInfo', { id: 123 }) */
  update(key: string, partial: Record<string, unknown>): void {
    _guard(key);
    const current = sharedStore.getState()[key as StateKey];
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      (globalThis as any).RPA_UTILS?.warn(`[StateManager] update()는 일반 객체에만 사용 가능합니다: "${key}"`);
      return;
    }
    sharedStore.setState({ [key]: { ...current, ...partial } } as Partial<SharedState>);
  },

  /** 케이스 연동 상태 전체 초기화 */
  resetCaseInfo: resetCaseInfoImpl,
};

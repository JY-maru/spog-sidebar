// [pseudo-code] hooks.ts
// React 패널이 공유 스토어를 구독하는 훅.
// 인자: 스토어에서 값을 고르는 selector. 반환: 선택한 값.

import { sharedStore, type SharedState } from './store';

export function useSharedStore<T>(select: (s: SharedState) => T): T {
  // 선택한 값이 바뀔 때만 리렌더한다
  return select(sharedStore.getState());
}

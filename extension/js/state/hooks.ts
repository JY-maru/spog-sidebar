// state/hooks.ts
// [의사코드] React 패널이 공유 스토어를 구독하는 훅.
// 패널을 React로 옮긴 시점부터 쓰인다 — 안 옮긴 코드는 legacy_adapter.ts를 쓴다.

import type { SharedState } from './store';

export function useSharedStore<T>(select: (s: SharedState) => T): T {
  // 스토어 구독 → 선택한 값이 바뀔 때만 리렌더
}

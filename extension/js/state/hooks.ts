// state/hooks.ts
// [MOCK] React 훅 — 패널이 React로 이전되는 시점부터 쓰인다(전체
// 패널이 한꺼번에 이전된 게 아니라, 패널마다 순서대로 하나씩 이전됐다 —
// 이 프로젝트의 실제 마이그레이션은 빅뱅 재작성이 아니라 점진적 이관이었다).
//
// sharedStore를 값으로 import하지 않고 타입만 가져온다. 이 파일은 패널
// 전용 번들에서도 import되는데, 값으로 import하면 그 번들이 store.ts를
// 자기 번들에 다시 포함시켜 state 번들이 만든 것과는 별개의 createStore()
// 인스턴스를 갖게 된다 — window.ResourceStore(state 번들이 할당)와 완전히
// 분리된 "가짜" 스토어를 구독하게 되는 조용한 버그. window.ResourceStore를
// 런타임에 직접 참조해 항상 같은 싱글턴을 구독하도록 한다(로드 순서상 state
// 번들이 패널 번들보다 먼저 실행되므로 이 시점엔 항상 준비돼 있음).
import { useStore } from 'zustand/react';
import type { SharedState } from './store';

/** window.ResourceStore(sharedStore)를 구독하는 React 훅. selector 없이
 *  부르면 전체 상태를 반환한다.
 *  예: const isWaiting = useSharedStore(s => s.isWaitingForAutomationResult); */
export function useSharedStore(): SharedState;
export function useSharedStore<T>(selector: (state: SharedState) => T): T;
export function useSharedStore<T>(selector?: (state: SharedState) => T) {
  return useStore(window.ResourceStore, selector as any);
}

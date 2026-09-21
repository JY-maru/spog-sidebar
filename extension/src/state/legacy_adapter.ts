// state/legacy_adapter.ts
// [의사코드] 구버전 window.StateManager API를 그대로 재현하는 파사드.
//
// 이 파일이 보여주는 것: 점진적 이관. 상태 계층만 Zustand로 바꾸고, 레거시
// 콘텐츠 스크립트는 호출부를 그대로 둔다. 이관된 패널은 훅으로, 그렇지 않은
// 코드는 이 파사드로 같은 스토어를 본다.

import { sharedStore, type StateKey } from './store';

export const legacyStateManager = {
  get(key: string) { return isDeclared(key) ? sharedStore.getState()[key as StateKey] : undefined; },
  set(key: string, value: unknown) { if (isDeclared(key)) sharedStore.setState({ [key]: value }); },

  // 객체 상태의 부분 병합만 허용한다. 배열·원시값이면 경고 후 무시한다.
  update(key: string, partial: object) { /* 객체면 병합, 아니면 경고 후 무시 */ },
};

// 스토어에 선언된 키만 통과시킨다. 선언되지 않은 키는 읽기·쓰기 모두 무시하고
// 콘솔에만 남긴다 — 레거시 호출부가 예외로 멈추지 않도록 반환값으로만 알린다.
function isDeclared(key: string): boolean {
  if (key in sharedStore.getState()) return true;
  console.warn(`[StateManager] 선언되지 않은 상태 키: ${key} — 무시함`);
  return false;
}

// [pseudo-code] legacy_adapter.ts
// 구버전 window.StateManager API를 재현하는 파사드.
// 이관된 패널은 훅으로, 그렇지 않은 코드는 이 파사드로 같은 스토어를 읽고 쓴다.

import { sharedStore, type StateKey } from './store';

export const legacyStateManager = {
  get(key: string) { return isDeclared(key) ? sharedStore.getState()[key as StateKey] : undefined; },
  set(key: string, value: unknown) { if (isDeclared(key)) sharedStore.setState({ [key]: value }); },

  // 인자: 상태 키, 병합할 객체. 객체가 아니면 무시한다.
  update(key: string, partial: object) { /* 객체면 병합, 아니면 경고 후 무시 */ },

  // 케이스 연결 상태를 비운다
  resetCaseInfo() { sharedStore.setState({ caseInfo: null }); },
};

// 인자: 상태 키. 반환: 스토어에 선언된 키인지 여부.
function isDeclared(key: string): boolean {
  if (key in sharedStore.getState()) return true;
  console.warn(`[StateManager] 선언되지 않은 상태 키: ${key} — 무시함`);
  return false;
}

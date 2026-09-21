// state/legacy_adapter.ts
// [의사코드] 구버전 window.StateManager API를 그대로 재현하는 파사드.
//
// 이 파일이 보여주는 것: 점진적 이관. 상태 계층만 Zustand로 바꾸고, 레거시
// 콘텐츠 스크립트는 호출부를 그대로 둔다. 이관된 패널은 훅으로, 그렇지 않은
// 코드는 이 파사드로 같은 스토어를 본다.

export const legacyStateManager = {
  get(key: string) { guard(key); return sharedStore.getState()[key as StateKey]; },
  set(key: string, value: unknown) { guard(key); sharedStore.setState({ [key]: value }); },

  // 객체 상태의 부분 병합만 허용한다. 배열·원시값이면 경고 후 무시한다.
  update(key: string, partial: object) { /* 객체면 병합, 아니면 경고 후 무시 */ },
};

// 선언되지 않은 키는 차단하지 않고 경고만 남긴다(레거시 호출부 호환).
function guard(key: string) {
  if (!(key in sharedStore.getState())) console.warn(`[StateManager] 알 수 없는 상태 키: ${key}`);
}

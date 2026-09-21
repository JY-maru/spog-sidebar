// state/index.ts
// [의사코드] 상태 계층 배선.
//
// 레거시 스크립트는 import를 못 쓰고 전역만 본다. 그래서 이 모듈 하나만 번들에서
// zustand를 import하고, 나머지는 전역으로 노출한다. config.ts 직후에 로드된다.

window.StateManager = legacyStateManager;
window.ResourceStore = sharedStore;

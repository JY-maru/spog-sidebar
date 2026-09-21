// state/index.ts
// [MOCK] message_router.ts/ui_controller.js(둘 다 클래식 콘텐츠스크립트)가
// 이 모듈을 직접 import하면 번들러가 로더+동적 import 쌍으로 바꿔버려서 스크립트
// 로드 순서가 깨진다("MessageRouter is not defined"류 버그). 그래서 이 파일
// 하나만 zustand를 import하고, config.ts의 전역 설정 객체와 같은 방식으로
// window에 매단다 — 별도 빌드 타깃으로 완전 정적 스크립트(state 번들)를
// 미리 만들어서 config.ts 직후에 로드한다.
//
// hooks.ts는 일부러 여기서 import하지 않는다 — zustand/react는 React를 peer
// dependency로 요구하는데, React는 패널이 실제로 React로 이전된 곳에서만
// 번들에 들어가야 한다. 지금 이 파일에 섞으면 콘텐츠스크립트용 정적 번들에
// React까지 딸려 들어가 버린다.
import { sharedStore } from './store';
import { legacyStateManager } from './legacy_adapter';

declare global {
  interface Window {
    /** 구 window.StateManager와 100% 호환되는 파사드.
     *  message_router.ts/ui_controller.js는 이걸 계속 무수정으로 호출한다. */
    StateManager: typeof legacyStateManager;
    /** 진짜 Zustand 스토어 — subscribe() 포함.
     *  React로 이전된 패널은 이 스토어(또는 useSharedStore 훅)를 직접 사용한다. */
    ResourceStore: typeof sharedStore;
  }
}

window.StateManager = legacyStateManager;
window.ResourceStore = sharedStore;

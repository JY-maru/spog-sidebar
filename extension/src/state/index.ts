// [pseudo-code] index.ts
// 상태 계층 배선. zustand를 import하는 유일한 모듈이며, 파사드를 전역에 등록한다.
// config.ts 직후에 로드된다.

import { legacyStateManager } from './legacy_adapter';
import { sharedStore } from './store';

window.StateManager = legacyStateManager;
window.ResourceStore = sharedStore;

// globals.d.ts
// [MOCK] 레거시 콘텐츠 스크립트는 import 없이 전역으로 서로를 참조한다.
// 그 전역들의 타입을 한 곳에 모아 TS 쪽 호출부(panels/*.tsx, state/*.ts,
// message_router.ts)가 any로 빠지지 않게 한다.

import type { AppConfig, AppUtils } from './config';

declare global {
  // config.ts가 globalThis에 심는 값 — 콘텐츠 스크립트와 서비스워커가 공유
  var RPA_APP_CONFIG: AppConfig;
  var RPA_UTILS: AppUtils;

  interface Window {
    RPA_APP_CONFIG: AppConfig;
    RPA_UTILS: AppUtils;

    /** state/index.ts가 등록하는 구버전 호환 파사드 */
    StateManager: {
      get(key: string): unknown;
      set(key: string, value: unknown): void;
      update(key: string, partial: object): void;
    };
    ResourceStore: Record<string, unknown>;

    /** message_router.ts가 등록하는 메시지 허브 파사드 */
    MessageRouter: { init(): void };

    /** ui_controller.js가 등록하는 UI 셸 */
    UiController: { init(): void };

    /** 패널 모듈들이 로드 순서대로 합성하는 네임스페이스 */
    Panels: Record<string, unknown>;
  }
}

export {};

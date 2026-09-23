// [pseudo-code] globals.d.ts
// 전역으로 노출되는 값과 파사드의 타입 선언.

import type { AppConfig, AppUtils } from './config';

declare global {
  // config.ts가 globalThis에 등록하는 값
  var RPA_APP_CONFIG: AppConfig;
  var RPA_UTILS: AppUtils;

  // 전역 이름으로 접근하는 파사드
  var UiController: Window['UiController'];
  var MessageRouter: Window['MessageRouter'];
  var StateManager: Window['StateManager'];
  var Panels: Window['Panels'];

  interface Window {
    RPA_APP_CONFIG: AppConfig;
    RPA_UTILS: AppUtils;

    /** state/index.ts가 등록하는 구버전 호환 파사드 */
    StateManager: {
      get(key: string): unknown;
      set(key: string, value: unknown): void;
      update(key: string, partial: object): void;
      resetCaseInfo(): void;
    };
    ResourceStore: Record<string, unknown>;

    /** message_router.ts가 등록하는 메시지 허브 파사드 */
    MessageRouter: { init(): void };

    /** ui_controller.ts가 등록하는 UI 셸 */
    UiController: {
      init(): void;
      updateStatus(text: string): void;
      switchPanel(id: string, opts?: { forced?: boolean }): void;
    };

    /** 패널 모듈들이 로드 순서대로 합성하는 네임스페이스 */
    Panels: Record<string, any>;
  }
}

export {};

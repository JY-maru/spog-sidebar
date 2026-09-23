// [pseudo-code] pseudocode.d.ts
// 구현 본문 없이 호출부만 남은 헬퍼들의 시그니처 선언.
// 실제 구현으로 옮길 때는 이 파일을 지우고 각 모듈의 export를 쓴다.

// ── 공통 유틸 ──────────────────────────────────────────────────
declare function wait(ms: number): Promise<void>;
declare function toast(text: string, tone?: ToneName): void;
declare function showToast(text: string, tone?: ToneName): void;
declare function now(): string;

type ToneName = 'success' | 'error' | 'warning' | 'info' | 'pending';

// ── 페이지 조작 (드라이버 공통) ────────────────────────────────
declare function injectScript(path: string, nonce: string): void;
declare function waitForElement(selector: string, timeoutMs?: number): Promise<Element | null>;
declare function setValueAndNotify(el: Element, value: string): void;
declare function fillForm(fields: Record<string, string>): Promise<void>;
declare function submit(): Promise<void>;
declare function save(): Promise<void>;
declare function isEmptyMessage(row: Element): boolean;
declare function parseRow(row: Element): Record<string, string>;

// ── 메시지 ─────────────────────────────────────────────────────
declare function onCommand<T = any>(type: string, handler: (msg: T) => void | Promise<void>): void;
declare function onIntercepted<T = any>(type: string, handler: (payload: T) => void): void;
// 인자: 채널 이름, 핸들러. 해당 채널의 CustomEvent를 받는다
declare function onInterceptorEvent(channel: string, handler: (detail: any) => void): void;
// 주입 시 전달되는 nonce
declare const INJECTED_NONCE: string;
declare function sendToHub(message: object): Promise<any>;
declare function report(result: object): void;

// ── 메인 월드 인터셉터 공통 ────────────────────────────────────
declare function urlOf(args: unknown[]): string;
declare function pickNeededFields<T>(payload: T): Partial<T>;
declare function parseJson(text: string): any;

// ── 도메인 ─────────────────────────────────────────────────────
declare function scopesByDistance(origin: Coords): Iterable<string>;
declare function isUsable(row: any): boolean;
declare function dedupeById<T>(rows: T[]): T[];
declare function dedupeByContact<T>(calls: T[]): T[];
declare function availableAt(row: any): number;

interface Coords { lat: number; lng: number }

// 표에서 읽어온 한 행.
type Row = Record<string, string | undefined>;

// ── 확장 API ───────────────────────────────────────────────────
// 실제로 쓰는 chrome API만 선언한다. 구현 시 @types/chrome으로 대체한다.
declare namespace chrome {
  namespace runtime {
    const id: string;
    const onMessage: {
      addListener(fn: (msg: any, sender: Sender, respond: (r?: unknown) => void) => unknown): void;
    };
    function sendMessage(message: unknown): Promise<any>;
  }
  namespace scripting {
    function executeScript(opts: {
      target?: { tabId: number };
      world?: 'MAIN' | 'ISOLATED';
      files?: string[];
      args?: unknown[];
    }): Promise<unknown>;
  }
  namespace storage {
    const session: {
      get(keys: string | string[]): Promise<Record<string, any>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
  }
}

interface Sender {
  id?: string;
  url?: string;
  frameId?: number;
  tab?: { id?: number };
}

// 외부 모듈의 형태 선언.
declare module 'zustand/vanilla' {
  export function createStore<T>(init: () => T): {
    getState(): T;
    setState(partial: Partial<T> | ((s: T) => Partial<T>)): void;
    subscribe(listener: (s: T, prev: T) => void): () => void;
  };
}

// ── 다른 파일에 실제로 있는 것들 ─────────────────────────────
// 저장소 안에 정의가 있는 심볼들. 구현 시 import로 대체한다.
declare function useSharedStore<T>(select: (s: any) => T): T;
declare function useTrackingStore<T>(select: (s: any) => T): T;
declare function useBulletinStore<T>(select: (s: any) => T): T;
declare function fetchBulletinDetail(id: string): Promise<void>;
declare function requestFromEmbedFrame(kind: string, timeoutMs?: number): Promise<any>;
declare function fetchSessionInfo(): Promise<{ loginId: string }>;
declare const TextParser: {
  parse(raw: string): Record<string, string>;
  isEnoughToSubmit(fields: Record<string, string>): boolean;
};

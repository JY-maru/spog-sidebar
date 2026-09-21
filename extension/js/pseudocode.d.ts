// pseudocode.d.ts
// 이 저장소의 소스는 흐름만 남긴 의사코드다. 구현 본문을 걷어내면서 호출부만
// 남은 헬퍼들의 시그니처를 여기 모아 둔다 — 각 파일이 선언으로 채워지는 걸 막고,
// "무엇을 호출하는가"가 한눈에 보이게 하는 목적.
//
// 실제 구현으로 옮길 때는 이 파일을 지우고 각 모듈의 실제 export를 쓰면 된다.

// ── 공통 유틸 ──────────────────────────────────────────────────
declare function wait(ms: number): Promise<void>;
declare function toast(text: string, tone?: ToneName): void;
declare function showToast(text: string, tone?: ToneName): void;
declare function now(): string;

type ToneName = 'success' | 'error' | 'warning' | 'info' | 'pending';

// ── 페이지 조작 (드라이버 공통) ────────────────────────────────
declare function injectScript(path: string): void;
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

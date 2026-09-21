// mock_sidebar_webhook.ts
// [의사코드] 사이드바 관리용 백엔드 웹훅의 모형.
//
// 스프레드시트를 저장소로 쓰는 외부 스크립트 런타임 역할을 대신한다. 그 런타임의
// 제약(동시 실행 제한, 콜드스타트, 느린 읽기)을 흉내 내, 확장 쪽 재시도·캐시
// 설계가 무엇을 전제하는지 드러낸다.

// ── 읽기: 목록과 본문을 분리해 캐시한다 ───────────────────────
// 목록은 자주·전체에게, 본문은 드물게·한 명에게 나간다. 그래서 캐시를 분리한다.
const listCache = new Map<string, unknown>();   // loginId → 목록 (짧은 TTL)
const detailCache = new Map<string, unknown>(); // bulletinId → 본문 (긴 TTL)

function GET_CLIENT_CONFIG({ loginId }: { loginId: string }) {
  return cached(listCache, loginId, () => ({
    version: currentVersion(),
    notices: readNotices(loginId),   // 이 사용자에게 보일 공지만
    queuePermission: readPermission(loginId),
  }));
}

function GET_BULLETIN_DETAIL({ bulletinId }: { bulletinId: string }) {
  return cached(detailCache, bulletinId, () => ({ content: readBody(bulletinId) }));
}

// ── 쓰기: 멱등 처리 ────────────────────────────────────────────
// 모든 쓰기는 클라이언트가 만든 idempotencyKey를 달고 온다. 재시도는 같은 키로
// 오므로, 키를 한 번 본 뒤에는 저장된 응답을 그대로 돌려주고 반영은 하지 않는다.
const seenWrites = new Map<string, unknown>(); // idempotencyKey → 첫 응답 (쓰기 TTL)

function deduped<T>(key: string, apply: () => T): T {
  if (seenWrites.has(key)) return seenWrites.get(key) as T; // 이미 반영된 요청
  const result = apply();
  seenWrites.set(key, result);
  return result;
}

function TOGGLE_BULLETIN_PIN({ loginId, bulletinId, pinned, idempotencyKey }: PinRequest) {
  return deduped(idempotencyKey, () => {
    writeRow(bulletinId, { pinned });
    invalidate(listCache, loginId);          // 다음 폴링이 새 값을 보게 한다
    return ok();
  });
}

// TOGGLE_BULLETIN_READ, REORDER_BULLETIN_PINS도 같은 모양 — deduped()로 감싼다.
// 순서 자체를 바꾸는 REORDER_BULLETIN_PINS는 키 단위 1회 반영에 의존한다.

interface PinRequest { loginId: string; bulletinId: string; pinned: boolean; idempotencyKey: string }

declare function cached<T>(store: Map<string, unknown>, key: string, load: () => T): T;
declare function invalidate(store: Map<string, unknown>, key: string): void;
declare function findRow(id: string): { pinned: boolean };
declare function writeRow(id: string, patch: object): void;
declare function readNotices(loginId: string): unknown[];
declare function readPermission(loginId: string): unknown;
declare function readBody(id: string): string;
declare function currentVersion(): string;
declare function ok(): { status: 'success' };

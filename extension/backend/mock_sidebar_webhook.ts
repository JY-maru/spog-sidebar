// [pseudo-code] mock_sidebar_webhook.ts
// 사이드바 관리용 백엔드 웹훅의 모형.
// 공지·권한 조회와 게시판 쓰기를 처리하며, 목록과 본문을 나눠 캐시한다.

// ── 읽기: 목록과 본문을 분리해 캐시한다 ───────────────────────
// 목록과 본문을 서로 다른 TTL로 캐시한다.
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
// 쓰기는 idempotencyKey를 달고 온다. 이미 본 키는 저장된 응답을 그대로 돌려준다.
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

// TOGGLE_BULLETIN_READ, REORDER_BULLETIN_PINS도 deduped()로 감싼다.

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

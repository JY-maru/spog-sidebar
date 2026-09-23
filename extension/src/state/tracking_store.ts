// [pseudo-code] tracking_store.ts
// 예약 블록 추적 목록. 스캔 결과를 병합해 목록을 유지한다.
//
// 병합 장치 두 개:
//   A) 톰스톤 — 생성/삭제를 확인한 id는 TTL 동안 확정값으로 취급한다.
//   B) 스코프 한정 병합 — 스캔이 넘긴 id 집합 안에서만 삭제를 반영한다.

const TOMBSTONE_TTL_MS = 8000; // 스캔 한 바퀴가 도는 시간보다 넉넉하게

export function markBlockCreated(id: string) { /* A) 생성 확정으로 보호 */ }
export function markBlockRemoved(id: string) { /* A) 삭제 확정으로 보호 */ }

// 인자: 발견한 블록 목록, 이번 스캔이 훑은 id 집합.
export function scopedMergeById(found: Block[], scannedIds: Set<string>) {
  const next = current().filter((b) => !scannedIds.has(b.id) || found.some((f) => f.id === b.id));
  for (const f of found) if (!isTombstonedAsRemoved(f.id)) upsert(next, f);
  setBlocks(next.filter((b) => !isTombstonedAsRemoved(b.id)));
}

interface Block { id: string; scanScopeId: string; label: string }

declare function current(): Block[];
declare function setBlocks(blocks: Block[]): void;
declare function upsert(list: Block[], block: Block): void;
declare function isTombstonedAsRemoved(id: string): boolean;

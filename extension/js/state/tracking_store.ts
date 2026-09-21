// state/tracking_store.ts
// [의사코드] 예약 블록 추적 목록.
//
// 이 파일이 보여주는 것: 폴링으로만 상태를 알 수 있는 외부 시스템을 상대로
// 깜빡임 없이 목록을 유지하는 방법.
//
// 전제 두 가지:
//   - 스캔 결과는 낡을 수 있다. 조회 종류에 따라 반영 시점이 다르다.
//   - 스캔은 여러 개가 동시에 돌고, 종류와 범위가 각각 다르다.
//
// 장치 두 개를 조합한다.
//   A) 톰스톤 — 생성/삭제를 확인한 id는 짧은 시간 동안 확정값으로 취급한다.
//   B) 스코프 한정 병합 — 스캔이 함께 넘긴 "실제로 훑은 id 집합" 안에서만
//      "결과에 없다 = 삭제됐다"로 해석하고, 범위 밖 항목은 그대로 둔다.

const TOMBSTONE_TTL_MS = 8000; // 스캔 한 바퀴가 도는 시간보다 넉넉하게

export function markBlockCreated(id: string) { /* A) 생성 확정으로 보호 */ }
export function markBlockRemoved(id: string) { /* A) 삭제 확정으로 보호 */ }

// B) 이번 스캔이 훑은 범위(scannedIds) 안에서만 삭제를 반영한다.
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

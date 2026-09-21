// state/tracking_store.ts
// [MOCK] 예약·배차 시스템의 "예약 블록" 추적 목록. 상태를 폴링(스캔)으로만
// 확인할 수 있는 외부 시스템을 상대로, 깜빡임 없이 목록을 유지하는 것이 이
// 스토어의 유일한 책임이다.
//
// 두 가지 제약을 전제한다.
//  - 스캔 결과는 낡을 수 있다. 단건 조회가 이미 본 변경을 전체 스캔은 아직
//    보지 못할 수 있다.
//  - 스캔은 동시에 여러 개가 진행된다. 서로 종류와 범위가 다르다.
//
// 그래서 두 장치를 조합한다:
//  A) 톰스톤(tombstone) — 방금 생성/제거를 확인한 id는 짧은 시간(TTL) 동안
//     "확정된 값"으로 보호한다. 그 시간 안에 낡은 스캔 결과가 반대로 말해도 무시.
//  B) scopedMergeById — 이번 스캔이 실제로 훑고 지나간 id 집합(scannedIds)을
//     같이 받아서, "이번 스캔 결과에 없다"를 "삭제됐다"로 해석하는 걸 그
//     스코프 안의 id로만 한정한다. 스코프 밖의 기존 항목은 이번 결과가
//     뭐라고 하든 그대로 둔다.
import { createStore } from 'zustand/vanilla';

export interface TrackedBlock {
  id: string;
  scanScopeId: string; // 이 항목을 발견한 스캔의 스코프(예: 예약번호) — B)의 핵심
  label: string;
  startAt?: string;
}

interface TrackingState {
  blocks: TrackedBlock[];
}

export const trackingStore = createStore<TrackingState>(() => ({ blocks: [] }));

const TOMBSTONE_TTL_MS = 8000; // 스캔 한 바퀴가 도는 시간보다 넉넉하게
const recentlyCreatedIds = new Map<string, number>(); // id -> 만료 시각
const recentlyRemovedIds = new Map<string, number>();

function isAlive(map: Map<string, number>, id: string): boolean {
  const exp = map.get(id);
  if (!exp) return false;
  if (Date.now() > exp) { map.delete(id); return false; }
  return true;
}

export function markBlockCreated(id: string): void {
  recentlyCreatedIds.set(id, Date.now() + TOMBSTONE_TTL_MS);
}
export function markBlockRemoved(id: string): void {
  recentlyRemovedIds.set(id, Date.now() + TOMBSTONE_TTL_MS);
}

/** 새로 생성 확인된 블록을 추가한다 — 방금 취소 확인된(A) id면 무시. 낡은
 *  재확인 스캔이 취소 사실을 놓치고 이 함수를 다시 부르는 경우를 막는다. */
export function addCreatedBlock(block: TrackedBlock): void {
  if (isAlive(recentlyRemovedIds, block.id)) return;
  trackingStore.setState((s) => (s.blocks.some((b) => b.id === block.id) ? s : { blocks: [...s.blocks, block] }));
}

/** [핵심] B) 스코프 한정 병합 — scanScopeId가 같은 기존 항목 중, 이번 스캔이
 *  실제로 훑었는데(scannedIds에 있음) 결과엔 없는 것만 제거한다. 스코프가
 *  다른 항목이나, 이번 스캔이 아예 안 훑은 항목은 결과에 없어도 그대로 둔다 —
 *  "다른 스캔이 서로의 발견을 지워버리는" 문제(2번)의 원인을 원천 차단. */
export function scopedMergeById(scanScopeId: string, scannedIds: string[], foundBlocks: TrackedBlock[]): void {
  trackingStore.setState((s) => {
    const stillRelevant = s.blocks.filter((b) => {
      if (b.scanScopeId !== scanScopeId) return true; // 다른 스코프는 무관
      if (isAlive(recentlyCreatedIds, b.id)) return true; // 방금 생성 확인됨 — 보호
      if (!scannedIds.includes(b.id)) return true; // 이번 스캔이 안 훑은 id — 판단 보류
      return foundBlocks.some((f) => f.id === b.id); // 훑었는데 결과에 없으면 진짜 사라진 것
    });
    const merged = [...stillRelevant];
    for (const f of foundBlocks) {
      if (isAlive(recentlyRemovedIds, f.id)) continue; // A) 방금 취소 확인됨 — 되살리지 않음
      if (!merged.some((b) => b.id === f.id)) merged.push(f);
    }
    return { blocks: merged };
  });
}

export function removeBlockWithTombstone(id: string): void {
  markBlockRemoved(id);
  trackingStore.setState((s) => ({ blocks: s.blocks.filter((b) => b.id !== id) }));
}

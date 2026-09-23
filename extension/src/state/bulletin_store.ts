// [pseudo-code] bulletin_store.ts
// 게시판(공지사항) 패널 상태.
// 고정/읽음/재정렬은 화면을 먼저 바꾸고, 쓰기 결과가 실패면 이전 상태로 되돌린다.
// 쓰기는 허브를 경유한다(service_worker.ts).

export interface Bulletin {
  id: string;
  title: string;
  isRead: boolean;
  isPinned: boolean;
  // 목록 응답에는 없다. 세부창을 열 때 개별 조회로 채운다.
  content?: string;
}

// 인자: 새 목록. 기존 목록을 통째로 교체한다.
export function setBulletins(list: Bulletin[]) { /* … */ }

// 인자: 게시글 id, 고정 여부. 화면을 먼저 바꾸고 실패 시 되돌린다.
export async function togglePin(id: string, pinned: boolean) {
  const before = snapshot();
  apply({ id, pinned });                                   // 1) 화면 먼저 바꾼다
  const res = await sendToHub({ type: 'TOGGLE_BULLETIN_PIN', id, pinned });
  if (!res.success) { restore(before); toast('고정에 실패했습니다.', 'error'); } // 2) 실패면 되돌린다
}

// 인자: 게시글 id. 본문을 조회해 스토어에 채운다.
export async function fetchBulletinDetail(id: string) { /* 허브에 GET_BULLETIN_DETAIL 요청 */ }

declare function snapshot(): Bulletin[];
declare function restore(list: Bulletin[]): void;
declare function apply(patch: { id: string; pinned: boolean }): void;

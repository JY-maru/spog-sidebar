// state/bulletin_store.ts
// [의사코드] 게시판(공지사항) 패널 상태.
//
// 이 파일이 보여주는 것: 되돌릴 수 있는 낙관적 업데이트.
// 고정/읽음을 누르면 화면이 즉시 바뀌고, 쓰기 결과를 확인해 실패하면 원래
// 상태로 되돌린다.
//
// 쓰기는 항상 허브를 경유한다. 허브의 세대 카운터가 낡은 폴링 응답을 걸러내므로,
// 이 스토어에는 타이밍을 추측하는 코드가 없다(service_worker.ts 참고).

export interface Bulletin {
  id: string;
  title: string;
  isRead: boolean;
  isPinned: boolean;
  // 목록 폴링 응답에는 본문이 없다. 세부창을 열 때 개별 조회로 채운다.
  content?: string;
}

// 폴링이 새 목록을 주면 통째로 교체한다(병합 없음 — 헤더 주석 참고).
export function setBulletins(list: Bulletin[]) { /* … */ }

// 낙관적 업데이트 → 허브 경유 쓰기 → 실패 시 롤백. 세 액션(읽음/고정/재정렬)이 같은 모양.
export async function togglePin(id: string, pinned: boolean) {
  const before = snapshot();
  apply({ id, pinned });                                   // 1) 화면 먼저 바꾼다
  const res = await sendToHub({ type: 'TOGGLE_BULLETIN_PIN', id, pinned });
  if (!res.success) { restore(before); toast('고정에 실패했습니다.', 'error'); } // 2) 실패면 되돌린다
}

// 본문은 세부창을 열 때만 가져온다.
export async function fetchBulletinDetail(id: string) { /* 허브에 GET_BULLETIN_DETAIL 요청 */ }

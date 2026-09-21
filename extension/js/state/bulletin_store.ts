// state/bulletin_store.ts
// [MOCK] 포털 게시판(공지사항) 패널 전용 상태.
//
// 설계 규칙 두 가지.
//  1) 쓰기(고정/읽음/재정렬)는 이 스토어에서 백엔드로 직접 보내지 않고 반드시
//     서비스워커를 경유한다. 서비스워커가 세대 카운터로 "쓰기 시작 이전에
//     나가 있던 폴링 응답"을 버려 주기 때문에, 쓰기와 배경 폴링(5분 알람)의
//     순서를 이 스토어가 추측할 필요가 없다(service_worker.ts 참고).
//  2) 그래서 이 파일에는 타이밍 기반 보정 코드가 없다. 폴링 응답이 오면
//     통째로 교체하는 것이 항상 옳다.
import { createStore } from 'zustand/vanilla';

export interface Bulletin {
  id: string;
  title: string;
  date: string;
  category: string;
  /** 목록 폴링 응답에는 이 필드가 없다 — 본문은 무겁고 폴링 시점엔 대개 아무도
   *  보지 않으므로 목록에 싣지 않는다. 세부창을 열 때 fetchBulletinDetail()로
   *  개별 조회해 채운다. */
  content?: string;
  isRead: boolean;
  isPinned: boolean;
  pinnedOrder?: number;
}

interface BulletinState {
  bulletins: Bulletin[];
  loginId: string;
}

export const bulletinStore = createStore<BulletinState>(() => ({ bulletins: [], loginId: '' }));

/** 배경 폴링(GET_CLIENT_CONFIG)이 CLIENT_CONFIG_UPDATED로 밀어줄 때마다 통째
 *  교체한다. 병합 로직이 없는 이유는 헤더 주석 1) 참고 — 서비스워커가 낡은
 *  응답을 애초에 보내지 않는다. */
export function setBulletins(bulletins: unknown, loginId?: string): void {
  const list = Array.isArray(bulletins) ? (bulletins as Bulletin[]) : [];
  bulletinStore.setState((s) => ({ bulletins: list, loginId: loginId || s.loginId }));
}

/** 낙관적 업데이트 → 서비스워커 경유 쓰기 → 실패 시 되돌림. 세 액션(읽음/고정/
 *  재정렬) 모두 같은 모양이다. fire-and-forget이 아니라 성공 여부를 확인해서
 *  실패를 화면에 반영한다. */
export async function toggleBulletinRead(id: string): Promise<void> {
  const { bulletins, loginId } = bulletinStore.getState();
  const target = bulletins.find((b) => b.id === id);
  if (!target) return;
  const prev = target.isRead;
  bulletinStore.setState({ bulletins: bulletins.map((b) => (b.id === id ? { ...b, isRead: !prev } : b)) });
  const res = await chrome.runtime.sendMessage({ type: 'TOGGLE_BULLETIN_READ', loginId, bulletinId: id, read: !prev });
  if (!res?.success) {
    bulletinStore.setState((s) => ({ bulletins: s.bulletins.map((b) => (b.id === id ? { ...b, isRead: prev } : b)) }));
  }
}

export async function toggleBulletinPin(id: string): Promise<void> {
  const { bulletins, loginId } = bulletinStore.getState();
  const target = bulletins.find((b) => b.id === id);
  if (!target) return;
  const prevPinned = target.isPinned;
  const prevOrder = target.pinnedOrder;
  const nowPinned = !prevPinned;
  const pinnedOrder = nowPinned ? Math.max(-1, ...bulletins.filter((b) => b.isPinned).map((b) => b.pinnedOrder ?? -1)) + 1 : -1;
  bulletinStore.setState({ bulletins: bulletins.map((b) => (b.id === id ? { ...b, isPinned: nowPinned, pinnedOrder } : b)) });
  const res = await chrome.runtime.sendMessage({ type: 'TOGGLE_BULLETIN_PIN', loginId, bulletinId: id, pinned: nowPinned, pinnedOrder });
  if (!res?.success) {
    bulletinStore.setState((s) => ({ bulletins: s.bulletins.map((b) => (b.id === id ? { ...b, isPinned: prevPinned, pinnedOrder: prevOrder } : b)) }));
  }
}

/** [신규] 본문 온디맨드 조회 — 성공하면 스토어에 패치해 같은 세션 안 재열람 시
 *  재요청을 막는다. 결과는 호출자에게도 반환해 컴포넌트가 자기 로딩/에러 UI를
 *  그리게 한다. */
export async function fetchBulletinDetail(id: string): Promise<{ success: boolean; content?: string; error?: string }> {
  const res = await chrome.runtime.sendMessage({ type: 'GET_BULLETIN_DETAIL', bulletinId: id });
  if (res?.success) {
    bulletinStore.setState((s) => ({ bulletins: s.bulletins.map((b) => (b.id === id ? { ...b, content: res.content } : b)) }));
    return { success: true, content: res.content };
  }
  return { success: false, error: res?.error };
}

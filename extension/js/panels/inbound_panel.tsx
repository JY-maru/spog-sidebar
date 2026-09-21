// panels/inbound_panel.tsx
// [MOCK] 사이드바 공통 셸(Shell) + 토스트 호스트 + 📥 인바운드 문의
// 패널. 실제 원본에서는 이 셋이 Shell.tsx / ToastHost.tsx(+toastStore.ts) /
// NoticesPanel.tsx로 각각 분리된 파일이지만, mock에서는 하나로 묶었다.
// 각 패널은 자기 전용 로컬 Zustand 스토어를 갖는다(원본의 accidentStore.ts,
// vocStore.ts 같은 패널별 스토어 패턴) — 여러 패널이 공유해야 하는 극소수
// 필드(알림 채널 온오프 등)만 state/hooks.ts의 useSharedStore로 전역
// sharedStore를 구독한다. 공지사항은 백엔드가 진실 소스이고 여기 보관하는
// 건 그 서버 상태의 로컬 캐시 + 낙관적 업데이트일 뿐이다 — message_router.ts가
// CLIENT_CONFIG_UPDATED를 받을 때마다 setAnnouncements()로 배열을 통째로
// 교체한다.
import { useState } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand/react';
import { useSharedStore } from '../state/hooks';

// =====================================================================
// 토스트 (전역, 패널 트리 바깥에 렌더)
// =====================================================================
interface Toast { id: string; text: string; tone: string; persistent?: boolean }
const toastStore = createStore<{ toasts: Toast[] }>(() => ({ toasts: [] }));
const AUTO_DISMISS_MS = 5000;

function pushToast(text: string, tone = 'info') {
  const id = `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  toastStore.setState((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
  setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
}
// 자동 소멸 없이, 같은 id로 다시 부르면 텍스트/톤만 교체(중복 방지) — 호출자가
// 직접 dismiss()할 때까지 유지된다. service_worker.ts의 "미새로고침 시스템 안내"용.
function upsertPersistentToast(id: string, text: string, tone = 'info') {
  toastStore.setState((s) => {
    const exists = s.toasts.some((t) => t.id === id);
    const next = exists ? s.toasts.map((t) => (t.id === id ? { ...t, text, tone } : t)) : [...s.toasts, { id, text, tone, persistent: true }];
    return { toasts: next };
  });
}
function dismissToast(id: string) {
  toastStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

function ToastHost() {
  const toasts = useStore(toastStore, (s) => s.toasts);
  return (
    <div id="spog-toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`} data-id={t.id}>{t.text}</div>
      ))}
    </div>
  );
}

// =====================================================================
// 셸 — 패널 전환 상태 (ui_controller.js의 switchPanel/flashNavItem이 호출)
// =====================================================================
const PANEL_IDS = ['panel-inbound', 'panel-case', 'panel-dispatch', 'panel-postcare', 'panel-settings'] as const;
type PanelId = (typeof PANEL_IDS)[number];
const shellStore = createStore<{ activePanel: PanelId; flashPanel: PanelId | null }>(() => ({ activePanel: 'panel-case', flashPanel: null }));

function setActivePanel(panelId: PanelId) {
  shellStore.setState({ activePanel: panelId });
}
function flashNavItem(panelId: PanelId) {
  shellStore.setState({ flashPanel: panelId });
  setTimeout(() => shellStore.setState({ flashPanel: null }), 600);
}

export function Shell() {
  const activePanel = useStore(shellStore, (s) => s.activePanel);
  const flashPanel = useStore(shellStore, (s) => s.flashPanel);
  return (
    <div id="spog-sidebar-shell">
      <nav className="spog-nav-rail">
        {PANEL_IDS.map((id) => (
          <button key={id} className={`spog-nav-item${id === activePanel ? ' active' : ''}${id === flashPanel ? ' flash' : ''}`} data-panel={id} />
        ))}
      </nav>
      <div className="spog-panel-body">
        {/* 실제 패널 컴포넌트는 activePanel에 따라 이 자리에 조건부로 마운트됨 (구현 생략) */}
      </div>
      <ToastHost />
    </div>
  );
}

/** ui_controller.js가 window.Panels.mount()로 부르는 진입점.
 *  실제로는 ReactDOM.createRoot(rootEl).render(<Shell />)를 호출한다. */
export function mount(rootEl: HTMLElement) {
  // createRoot(rootEl).render(<Shell />) — 구현 생략
  rootEl.dataset.mounted = 'true';
}

// =====================================================================
// 📥 인바운드 문의 패널 고유 상태
// =====================================================================
interface Notice { id: string; title: string; isRead: boolean; date?: string; pinnedOrder?: number }
const inboundStore = createStore<{ notices: Notice[]; loginId: string; badgeCount: number; memberName: string }>(() => ({
  notices: [], loginId: '', badgeCount: 0, memberName: '',
}));

// 정렬 우선순위: 개인고정 > 안읽음 > 읽음, 각 구간 내부는 최신순
function sortWithinTier(list: Notice[]): Notice[] {
  return [...list].sort((a, b) => {
    const aPinned = (a.pinnedOrder ?? -1) !== -1;
    const bPinned = (b.pinnedOrder ?? -1) !== -1;
    if (aPinned && bPinned) return (a.pinnedOrder ?? 0) - (b.pinnedOrder ?? 0);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return (b.date || '').localeCompare(a.date || '');
  });
}

function toggleNoticeRead(id: string) {
  const target = inboundStore.getState().notices.find((n) => n.id === id);
  if (!target) return;
  const nowRead = !target.isRead;
  inboundStore.setState((s) => ({ notices: s.notices.map((n) => (n.id === id ? { ...n, isRead: nowRead } : n)) })); // 낙관적 업데이트
  fetch(window.RPA_APP_CONFIG.URL.SIDEBAR_MGMT_WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: nowRead ? 'MARK_NOTICE_READ' : 'MARK_NOTICE_UNREAD', loginId: inboundStore.getState().loginId, noticeId: id }),
  }).catch((err) => console.error('[Panels:Inbound] 공지 읽음처리 실패:', err));
}

/** message_router.ts가 message_router.ts CLIENT_CONFIG_UPDATED 처리 시 호출 */
function setAnnouncements(announcements: Notice[], loginId: string) {
  inboundStore.setState((s) => ({ notices: Array.isArray(announcements) ? announcements : [], loginId: loginId || s.loginId }));
}
/** message_router.ts INBOUND_CALLBACK_ARRIVED 처리 시 호출 — 예번 없이도
 *  이름+회원ID만으로 헤더에 표시. 콜백 "건수" 갱신과 달리 패널을 강제
 *  전환하지 않는다(상담원이 이미 보고 있는 화면일 확률이 높아 인터럽트가
 *  아니라 정보 갱신으로 취급). */
function memberArrived(data: { name?: string }) {
  inboundStore.setState({ memberName: data.name || '' });
}
function setBadgeCount(count: number) {
  inboundStore.setState({ badgeCount: count });
}

function NoticeList() {
  const notices = useStore(inboundStore, (s) => s.notices);
  const sorted = sortWithinTier(notices);
  return (
    <ul id="inbound-notice-list">
      {sorted.map((n) => (
        <li key={n.id} className={n.isRead ? 'read' : 'unread'} onClick={() => toggleNoticeRead(n.id)}>{n.title}</li>
      ))}
    </ul>
  );
}

/** 알림 채널 섹션 — 전역 sharedStore의 notificationChannelToggleEnabled를
 *  직접 구독한다(패널 로컬 스토어가 아니라 useSharedStore를 쓰는 이유는,
 *  이 플래그가 백그라운드 폴링 결과로 여러 패널에 동시에 영향을 줘야
 *  하기 때문 — VocPanel의 큐 토글 구독과 동일한 패턴). */
function NotificationChannelSection() {
  const enabled = useSharedStore((s) => s.notificationChannelToggleEnabled);
  if (!enabled) return null;
  return <div id="inbound-channel-badge">알림 채널 수신 중</div>;
}

export function InboundPanel() {
  const memberName = useStore(inboundStore, (s) => s.memberName);
  const badgeCount = useStore(inboundStore, (s) => s.badgeCount);
  return (
    <div id="panel-inbound" className="spog-panel">
      <div id="inbound-member-name">{memberName}</div>
      <NotificationChannelSection />
      <NoticeList />
      <span className="badge">{badgeCount}</span>
    </div>
  );
}

export const inboundActions = { memberArrived, setBadgeCount, setAnnouncements, toggleNoticeRead };
export const toastActions = { push: pushToast, upsertPersistent: upsertPersistentToast, dismiss: dismissToast };

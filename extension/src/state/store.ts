// [pseudo-code] store.ts
// 사이드바 공유 상태. 패널 여러 개가 같은 값을 구독한다.
// 탭 로컬 화면 상태를 담고, 탭 간 진행 상태는 허브가 갖는다(service_worker.ts).

import { createStore } from 'zustand/vanilla';

export interface SharedState {
  caseInfo: CaseInfo | null;   // 지금 연결된 케이스 (없으면 null)
  agentName: string;
  activePanel: string;
  pendingRefreshSystems: string[];
}

export const sharedStore = createStore<SharedState>(() => ({
  caseInfo: null,
  agentName: '',
  activePanel: 'panel-case',
  pendingRefreshSystems: [],
}));

// 상태 키 목록.
export type StateKey = keyof SharedState;

interface CaseInfo { caseId: string; customerName: string; resourceCode: string }

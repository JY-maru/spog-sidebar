// state/store.ts
// [의사코드] 사이드바 공유 상태. 패널 여러 개가 같은 값을 본다.
//
// 두 단계 상태 설계의 아래쪽 절반이다.
//   - 여기(탭 로컬): 새로고침하면 사라져도 되는 화면 상태
//   - 허브(service_worker.ts): 탭이 닫혀도 이어져야 하는 진행 상태

import { createStore } from 'zustand/vanilla';

interface SharedState {
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

// 상태 키는 이 타입에 선언된 것만 쓴다(legacy_adapter.ts의 가드 참고).
export type StateKey = keyof SharedState;

interface CaseInfo { caseId: string; customerName: string; resourceCode: string }

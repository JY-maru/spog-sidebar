// panels/postcare_panel.tsx
// [MOCK] 🗂️ 사후관리 패널 — 결과 로그 시트(쓰기 전용) 확인 + 사진 검수
// 배치 스캔 트리거. SCAN_BATCH_COMPLETE/SCAN_ALERT는 message_router.ts가
// React 트리 밖(백그라운드 이벤트)에서 이 패널 상태를 갱신해야 하므로 로컬
// zustand 스토어로 분리되어 있던 원본 구조를 그대로 반영한다.
import { useEffect, useRef } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand/react';

// scanStep: 0=숨김, 1=대기건 탐색, 2=검수 진행, 4=완료
const postcareStore = createStore<{ scanStep: number; scanning: boolean; scanMsg: { text: string; tone?: string } | null; lastSyncTime: string }>(() => ({
  scanStep: 0, scanning: false, scanMsg: null, lastSyncTime: '데이터 없음',
}));

let msgHideTimer: ReturnType<typeof setTimeout> | null = null;
let stepResetTimer: ReturnType<typeof setTimeout> | null = null;

function showMsg(text: string, tone: string | undefined, durationMs: number) {
  if (msgHideTimer) clearTimeout(msgHideTimer);
  postcareStore.setState({ scanMsg: { text, tone } });
  msgHideTimer = setTimeout(() => postcareStore.setState({ scanMsg: null }), durationMs);
}

// ── 지금 바로 검수 스캔 버튼 — 대기건 조회 후 없으면 즉시 종료, 있으면
//    배치 스캔을 시작하고 SCAN_BATCH_COMPLETE(비동기, 여러 케이스 관리 시스템 탭을
//    거쳐 나중에 도착)를 기다린다. ──
async function executeImageScan() {
  postcareStore.setState({ scanning: true, scanStep: 1 });
  window.UiController.updateStatus('검수 필요건 조회 중...');
  try {
    const res = await fetch(`${window.RPA_APP_CONFIG.URL.SIDEBAR_MGMT_WEBHOOK}?action=GET_PENDING_SCANS`);
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message);
    if (!data.pending?.length) {
      postcareStore.setState({ scanStep: 0, scanning: false });
      window.UiController.updateStatus('검수할 항목이 없습니다.', 'success');
      showMsg('검수할 항목이 없습니다.', undefined, 5000);
      return;
    }
    postcareStore.setState({ scanStep: 2 });
    chrome.runtime.sendMessage({ type: 'START_IMAGE_SCAN_BATCH', reservations: data.pending.map((i: any) => i.resId) });
  } catch (err: any) {
    postcareStore.setState({ scanStep: 0, scanning: false });
    window.UiController.updateStatus(`오류: ${err.message}`, 'error');
  }
}

// SCAN_BATCH_COMPLETE(message_router.ts) → 배치 정상 완료
function onScanBatchComplete() {
  const lastSyncTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
  postcareStore.setState({ scanning: false, scanStep: 4, lastSyncTime });
  chrome.storage.local.set({ [window.RPA_APP_CONFIG.STORAGE_KEY.LAST_SYNC_TIME]: lastSyncTime });
  window.UiController.updateStatus('사진 검수 완료', 'success');
  if (stepResetTimer) clearTimeout(stepResetTimer);
  stepResetTimer = setTimeout(() => postcareStore.setState({ scanStep: 0 }), 2000);
}

// SCAN_ALERT(message_router.ts) → 스캔 중 오류(토큰/페이지 만료 등)
function showScanAlert(text: string, tone?: string) {
  postcareStore.setState({ scanning: false, scanStep: 0 });
  showMsg(text, tone, 8000);
}

function loadLastSyncTime() {
  chrome.storage.local.get([window.RPA_APP_CONFIG.STORAGE_KEY.LAST_SYNC_TIME], (res) => {
    const saved = res[window.RPA_APP_CONFIG.STORAGE_KEY.LAST_SYNC_TIME];
    if (saved) postcareStore.setState({ lastSyncTime: saved });
  });
}

export function PostcarePanel() {
  const scanning = useStore(postcareStore, (s) => s.scanning);
  const scanMsg = useStore(postcareStore, (s) => s.scanMsg);
  const lastSyncTime = useStore(postcareStore, (s) => s.lastSyncTime);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    loadLastSyncTime();
  }, []);

  return (
    <div id="panel-postcare" className="spog-panel">
      <button onClick={executeImageScan}>지금 검수 스캔</button>
      <div id="postcare-scan-status">{scanMsg?.text || (scanning ? '검수 진행 중...' : '')}</div>
      <div id="postcare-last-sync">{lastSyncTime}</div>
    </div>
  );
}

export const postcareActions = { executeImageScan, onScanBatchComplete, showScanAlert, loadLastSyncTime };

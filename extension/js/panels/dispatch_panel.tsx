// panels/dispatch_panel.tsx
// [MOCK] 🚗 예약/배차 자동화 패널 — 원버튼 자동화 3종(예약블록 생성/
// 고객 예약 생성/후보 리소스 검색)을 하나의 패널에 담는다. 실제 원본에서는
// 관련 조회, 예약변경, 후보 리소스 검색, 추적 확인이 각각 독립된 패널
// 컴포넌트(+ 각자의 로컬 zustand 스토어)였지만(message_router.ts와 DOM을
// 직접 안 건드리는 setXxx(msg) 콜백만으로 연결된 완전히 독립적인 모듈들이었음),
// mock에서는 하나의 배차 패널로 합쳤다. 상관관계ID(resId)를 기준으로 요청/
// 응답을 매칭하는 구조는 그대로 유지한다.
import { useRef } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand/react';

interface ResInfo { resType?: string; coverageOption?: string; duration?: string; error?: string }
interface ReservationBlockInfo { reservationBlockAssetId?: string; reservationBlockRegionName?: string; error?: string }
interface CandidateResult { resourceType: string; distKm: number; address: string }
interface SearchProgress { matchingCount: number; wave?: number }

const dispatchStore = createStore<{
  resInfo: ResInfo | null;
  blockInfo: ReservationBlockInfo | null;
  searchResult: CandidateResult[] | null;
  searchProgress: SearchProgress | null;
}>(() => ({ resInfo: null, blockInfo: null, searchResult: null, searchProgress: null }));

function setResInfo(msg: ResInfo) {
  dispatchStore.setState({ resInfo: msg.error ? null : msg });
  window.UiController.updateStatus(msg.error ? '고객 예약 조회 실패' : '고객 예약 정보 조회 완료', msg.error ? 'error' : 'success');
}
function setBlockInfo(msg: ReservationBlockInfo) {
  dispatchStore.setState({ blockInfo: msg.error ? null : msg });
  window.UiController.updateStatus(msg.error ? '예약블록 조회 실패' : '예약블록 확인 완료', msg.error ? 'error' : 'success');
}
function setSearchResult(msg: { results: CandidateResult[] }) {
  dispatchStore.setState({ searchResult: msg.results });
  window.UiController.updateStatus(`후보 리소스 ${msg.results.length}건`, 'success');
}
function setSearchProgress(msg: { progress: SearchProgress }) {
  dispatchStore.setState({ searchProgress: msg.progress });
}
function setSearchError(msg: { error: string }) {
  window.UiController.showToast(`후보 검색 실패: ${msg.error}`, 'error');
}

function ResSummary() {
  const resInfo = useStore(dispatchStore, (s) => s.resInfo);
  const blockInfo = useStore(dispatchStore, (s) => s.blockInfo);
  return (
    <>
      {resInfo && <div id="dispatch-res-summary">✓ {resInfo.resType || '일반'} | 보장옵션 {resInfo.coverageOption} | {resInfo.duration}</div>}
      {blockInfo && <div id="dispatch-block-summary">✓ {blockInfo.reservationBlockAssetId} | {blockInfo.reservationBlockRegionName}</div>}
    </>
  );
}
function CandidateList() {
  const results = useStore(dispatchStore, (s) => s.searchResult);
  return (
    <ul id="dispatch-candidate-list">
      {(results || []).map((c, i) => (
        <li key={i}>{c.resourceType} · {c.distKm.toFixed(1)}km · {c.address}</li>
      ))}
    </ul>
  );
}
function SearchProgressBar() {
  const progress = useStore(dispatchStore, (s) => s.searchProgress);
  if (!progress) return null;
  return <div id="dispatch-search-progress">탐색 중... ({progress.matchingCount}건 매칭 / wave {progress.wave ?? 0})</div>;
}

// ── 원버튼 자동화 1: 예약블록 생성 (✍️ 쓰기) ──
function createReservationBlock(resId: string) {
  if (!resId) return window.UiController.showToast('예약번호를 입력해주세요.', 'warning');
  window.UiController.updateStatus('예약·배차 시스템으로 이동해 예약블록을 생성합니다...', 'pending');
  chrome.runtime.sendMessage({ type: 'REQ_CREATE_RESERVATION_BLOCK', resId });
}

// ── 원버튼 자동화 2: 고객 예약 생성 (✍️ 쓰기, 완료 후 고객 응대 시스템 자동 연쇄) ──
function executeReservation(resId: string, blockResId: string) {
  if (!resId || !blockResId) return window.UiController.showToast('예약번호와 예약블록 번호를 모두 입력해주세요.', 'warning');
  window.UiController.updateStatus('예약 변경 처리 중...', 'pending');
  chrome.runtime.sendMessage({ type: 'REQ_DISPATCH_EXECUTE', customerResId: resId, blockResId });
}

// ── 원버튼 자동화 3: 후보 리소스 검색·스코어링 (📡 읽기, 세대+AbortController 가드) ──
function startCandidateSearch(resId: string, selectedCategories: string[]) {
  if (!resId) return window.UiController.showToast('예약번호를 입력해주세요.', 'warning');
  chrome.runtime.sendMessage({ type: 'REQ_CANDIDATE_SEARCH_START', resId, selectedCategories });
}
function stopCandidateSearch(resId: string) {
  chrome.runtime.sendMessage({ type: 'REQ_CANDIDATE_SEARCH_STOP', resId });
}
function expandCandidateSearch(resId: string) {
  chrome.runtime.sendMessage({ type: 'REQ_CANDIDATE_SEARCH_EXPAND', resId });
}

export function DispatchPanel() {
  const blockResRef = useRef<HTMLInputElement>(null);
  const targetBlockRef = useRef<HTMLInputElement>(null);
  const searchResRef = useRef<HTMLInputElement>(null);

  return (
    <div id="panel-dispatch" className="spog-panel">
      <ResSummary />
      <input id="dispatch-block-res-input" ref={blockResRef} placeholder="예약번호" />
      <button onClick={() => createReservationBlock(blockResRef.current?.value.trim() || '')}>예약블록 생성 (입력)</button>

      <input id="dispatch-target-block-input" ref={targetBlockRef} placeholder="예약블록 번호" />
      <button onClick={() => executeReservation(blockResRef.current?.value.trim() || '', targetBlockRef.current?.value.trim() || '')}>고객 예약 생성 (입력)</button>

      <input id="dispatch-search-res-input" ref={searchResRef} placeholder="예약번호" />
      <button onClick={() => startCandidateSearch(searchResRef.current?.value.trim() || '', [])}>후보 검색 (조회)</button>
      <button onClick={() => stopCandidateSearch(searchResRef.current?.value.trim() || '')}>중단</button>
      <button onClick={() => expandCandidateSearch(searchResRef.current?.value.trim() || '')}>더 넓게 검색</button>

      <SearchProgressBar />
      <CandidateList />
    </div>
  );
}

export const dispatchActions = { setResInfo, setBlockInfo, setSearchResult, setSearchProgress, setSearchError, createReservationBlock, executeReservation, startCandidateSearch, stopCandidateSearch, expandCandidateSearch };

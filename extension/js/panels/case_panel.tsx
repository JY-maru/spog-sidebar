// panels/case_panel.tsx
// [MOCK] 📋 케이스 처리 패널(기본 활성) — 접수양식 텍스트 파싱 결과와
// 케이스 관리 시스템 RPA 진행 표시줄, 케이스 연결 상태를 보여준다. message_router.ts가
// 교차검증을 통과시킨 뒤에만 setConnected()를 호출한다(이 파일 자체는 검증하지
// 않는다 — 검증 책임은 message_router.ts에 있고, 여기는 결과 반영만 한다).
// 패널 전용 로컬 Zustand 스토어(caseStore) 패턴 — 원본의 accidentStore.ts에 대응.
import { useRef } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand/react';

interface Recipient { name: string; phone: string }
interface CaseState {
  connected: boolean;
  connectedLabel: string;
  mismatch: boolean;
  recipientList: Recipient[];
}
const caseStore = createStore<CaseState>(() => ({ connected: false, connectedLabel: '', mismatch: false, recipientList: [] }));

function setConnected(label: string) {
  caseStore.setState({ connected: true, connectedLabel: label, mismatch: false });
}
function setDisconnected() {
  caseStore.setState({ connected: false, connectedLabel: '', mismatch: false });
}
// 검증 실패 시 팝업 대신 빨간불 + "정보 불일치" 텍스트만 표시(원본 방어 로직
// 그대로) — 사용자가 매번 팝업을 닫아야 하는 번거로움을 없앤 UX 결정.
function applyMismatch() {
  caseStore.setState({ mismatch: true, connected: false });
}
function clearRecipientsForNewCard() {
  caseStore.setState({ recipientList: [] });
}
function renderRecipientList(list: Recipient[]) {
  caseStore.setState({ recipientList: list });
}

function StatusBadge() {
  const connected = useStore(caseStore, (s) => s.connected);
  const label = useStore(caseStore, (s) => s.connectedLabel);
  const mismatch = useStore(caseStore, (s) => s.mismatch);
  const text = mismatch ? '🔴 정보 불일치' : connected ? `🟢 ${label}` : '⚪ 연결 안 됨';
  return <div id="case-status-badge">{text}</div>;
}

function RecipientList() {
  const list = useStore(caseStore, (s) => s.recipientList);
  return (
    <ul id="case-recipient-list">
      {list.map((r, i) => (
        <li key={i}>{r.name} ({r.phone})</li>
      ))}
    </ul>
  );
}

// ── 접수양식 텍스트 파싱 → RPA 시작 진입점 ──
function submitIntakeText(rawText: string) {
  const fields = window.TextParser.parseIntakeTemplate(rawText);
  if (!fields) {
    window.UiController.showToast('접수양식 형식을 인식하지 못했습니다. 필수 항목을 확인해주세요.', 'warning');
    return;
  }
  const data = window.TextParser.normalizeFields(fields);
  window.UiController.updateStatus('케이스 관리 시스템으로 이동해 접수 카드를 생성합니다...', 'info');
  chrome.runtime.sendMessage({ type: 'DO_START_CASE_AUTOMATION', data, searchMode: data.resId ? 'RES' : 'ASSET' });
}

export function CasePanel() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  return (
    <div id="panel-case" className="spog-panel active">
      <StatusBadge />
      <textarea id="case-intake-textarea" ref={textareaRef} />
      <button onClick={() => submitIntakeText(textareaRef.current?.value || '')}>접수 카드 생성</button>
      <RecipientList />
    </div>
  );
}

export const caseActions = { setConnected, setDisconnected, applyMismatch, clearRecipientsForNewCard, renderRecipientList, submitIntakeText };

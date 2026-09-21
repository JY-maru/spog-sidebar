// case_system_driver.js
// [MOCK] 케이스 관리 시스템 콘텐츠 스크립트 — 접수 카드 생성 RPA.
// 실제 사이트의 Vue 기반 SPA 폼을 자동 채움+제출한다. all_frames로 주입되며
// (우편번호 검색 팝업 iframe 포함), 페이지 메인월드 스파이(case_system_interceptor.js)와
// 1회성 토큰으로 검증된 postMessage 채널을 사용한다.

// ── postMessage 위조 방지 토큰 — 이 페이지의 모든 프레임이 공유 ──
let RPA_MSG_TOKEN = sessionStorage.getItem('SPOG_MSG_TOKEN');
if (!RPA_MSG_TOKEN) {
  RPA_MSG_TOKEN = crypto.randomUUID();
  sessionStorage.setItem('SPOG_MSG_TOKEN', RPA_MSG_TOKEN);
}

// case_system_interceptor.js(메인월드 스파이)를 동적 주입
(() => {
  const spy = document.createElement('script');
  spy.src = chrome.runtime.getURL('js/case_system_interceptor.js');
  spy.onload = () => spy.remove();
  (document.head || document.documentElement).appendChild(spy);
})();

// ── 기본 대기/조작 헬퍼 ──
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForElement(selector, timeoutMs = 3000, predicate = () => true) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.querySelector(selector);
    if (el && predicate(el)) return el;
    await wait(100);
  }
  return null;
}
// Vue 반응형 시스템은 순수 DOM 값 대입만으로는 감지 못 하므로 네이티브 setter를
// 우회 호출한 뒤 input 이벤트를 수동 디스패치해 동기화한다.
function triggerVueEvent(el) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, el.value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function isUnknownValue(v) {
  return !v || /^(미상|확인\s*불가|-)$/.test(String(v).trim());
}

// ── 입력 헬퍼 — 하나씩 순서대로, scrollIntoView 후 짧은 딜레이를 두고 채운다
//    (실제 RPA 툴의 "사람처럼 하나씩" 동작을 재현하며, 렌더 타이밍 이슈도 줄인다) ──
async function rpaFillInput(placeholder, value) {
  if (!value) return;
  const el = await waitForElement(`input[placeholder="${placeholder}"]`, 1500);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await wait(200);
  el.value = String(value).replace(/[^0-9]/g, '');
  triggerVueEvent(el);
}
async function rpaFillInputText(placeholder, value) {
  if (!value) return;
  const el = await waitForElement(`input[placeholder="${placeholder}"]`);
  if (!el) return;
  el.scrollIntoView();
  await wait(100);
  el.value = value.trim();
  triggerVueEvent(el);
}

// 날짜 필드는 별도 처리: 유효한 YYYY-MM-DD 형식이 아니거나 값이 없으면
// "일시 미상" 체크박스를 켜는 쪽으로 폴백한다(중복 클릭으로 체크 해제되는
// 사고를 막기 위해 이미 체크돼 있는지 먼저 확인).
async function rpaFillDate(value) {
  const dateStr = value ? String(value).split('\n')[0].trim() : '';
  const isValid = /^\d{4}-\d{2}-\d{2}/.test(dateStr);

  if (!dateStr || isUnknownValue(dateStr) || !isValid) {
    const label = await waitForElement('label.checkbox-unknown-date', 3000, (l) => l.innerText.includes('일시 미상'));
    if (label) {
      const alreadyChecked = label.classList.contains('is-checked') || label.querySelector('input')?.checked;
      if (!alreadyChecked) { label.scrollIntoView({ block: 'center' }); await wait(200); label.click(); }
    }
    return;
  }
  const input = await waitForElement('.date-editor input');
  if (!input) return;
  input.scrollIntoView({ block: 'center' });
  await wait(200);
  input.value = dateStr;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(100);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// ── 검색 결과 선택 → 다음 단계 진입 — "결과 없음"(정상)과 "조회 실패"(에러)를
//    반드시 구분한다. 테이블이 "데이터 없음"을 정상적으로 표시한 경우까지
//    에러 토스트로 잘못 분류하면 실제 장애 신호가 노이즈에 묻힌다. ──
async function clickNextBtnAndFillForm(data, searchMode) {
  UiController.updateStatus('검색 결과 렌더링 완료 대기 중...');
  const resultRow = await waitForElement(
    '.result-table tbody tr',
    8000,
    (el) => el.offsetParent !== null && el.textContent.length > 5 && !el.textContent.includes('데이터 없음'),
  );
  if (!resultRow) {
    const noDataShown = document.querySelector('.result-table')?.textContent?.includes('데이터 없음');
    if (noDataShown) return UiController.updateStatus('검색 결과가 없습니다.', 'info');
    return UiController.updateStatus('[에러] 검색 결과를 불러오지 못했습니다.', 'error');
  }
  const radio = resultRow.querySelector('.radio-select');
  if (radio && !radio.className.includes('is-checked')) radio.click();
  else if (!radio) resultRow.click();

  const nextBtn = await waitForElement('.btn-group button.btn-primary.btn-large', 8000, (b) => !b.disabled);
  if (!nextBtn) return UiController.updateStatus('[다음] 버튼 비활성화', 'error');
  await wait(500);
  nextBtn.click();
  await waitForElement('textarea[placeholder="사고내용을 입력해주세요."]', 8000);
  await fillCaseCard(data);
}

// ── 우편번호 팝업(다음/카카오 postcode) 결과를 접수 폼에 주입 ──
function injectAddressToForm(address) {
  const targetInput = document.querySelector('input[name="roadAddress"]');
  if (targetInput) { targetInput.value = address; triggerVueEvent(targetInput); }
}

// ── 폼 섹션별 필드 채움 — 실제로는 4개 섹션(신고자/운전자/사고상황/보상범위)이
//    이 순서로 하나씩 채워진다 ──
async function registerReporterSection(data) {
  await rpaFillInputText('신고자 성명', data.reporterName);
  await rpaFillInput('신고자 연락처', data.reporterPhone);
}
async function registerDriverSection(data) {
  await rpaFillInputText('운전자 성명', data.driverName);
  await rpaFillInput('운전자 연락처', data.driverPhone);
}
async function registerAccidentSituation(data) {
  await rpaFillDate(data.accidentAt);
  await rpaFillInputText('사고장소', data.location);
}
async function registerCoverageSection(data) {
  // 보장옵션(보장한도/견인 등) 체크박스 세트 — 데이터에 있는 항목만 선택
  for (const key of data.coverageKeys || []) {
    const label = await waitForElement(`label[data-coverage="${key}"]`, 1500);
    if (label && !label.classList.contains('is-checked')) label.click();
  }
}
async function fillCaseCard(data) {
  await registerReporterSection(data);
  await registerDriverSection(data);
  await registerAccidentSituation(data);
  await registerCoverageSection(data);
  UiController.updateStatus('케이스 카드 입력 완료 — 최종 검토 후 제출하세요.', 'success');
}

// ── SMS 발송 — 접수완료 안내 문자를 헤드리스로 발송 ──
async function fetchSmsTemplate(caseId) {
  const res = await fetch(`/api/case/${caseId}/sms-template`);
  return (await res.json()).template;
}
async function sendSmsHeadless(phone, message) {
  return fetch('/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, message }),
  });
}

// ── 진입점 — 사이드바에서 접수양식 파싱 결과를 받아 전체 시나리오 실행 ──
async function startAutomation(data, searchMode) {
  UiController.updateStatus('접수 자동화 시작', 'info');
  await clickNextBtnAndFillForm(data, searchMode);
}

// ── 메인월드(case_system_interceptor.js) → 이 콘텐츠 스크립트 릴레이. 오리진은 반드시
//    "이 페이지 자신"인지만 검사한다(콘텐츠 스크립트는 항상 자신이 주입된
//    페이지와만 통신하므로 self-origin 비교로 충분). ──
window.addEventListener('message', (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.__spogToken !== RPA_MSG_TOKEN) return;
  if (e.data?.type === 'INTERCEPTED_AGENT_INFO') {
    chrome.runtime.sendMessage({ type: 'INTERCEPTED_AGENT_INFO', ...e.data.payload }).catch(() => {});
  }
  if (e.data?.type === 'INTERCEPTED_CASE') {
    chrome.runtime.sendMessage({ type: 'INTERCEPTED_CASE', ...e.data.payload }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'DO_START_CASE_AUTOMATION') startAutomation(msg.data, msg.searchMode);
  if (msg.type === 'DO_INJECT_ADDRESS') injectAddressToForm(msg.address);
});

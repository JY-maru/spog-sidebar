// customer_system_driver.ts
// [의사코드] 고객 응대 시스템 페이지 자동화.
//
// 이 파일이 보여주는 것: "사용자가 아무것도 누르지 않는 자동 연계".
// 예약이 생성되면 허브가 이 탭을 대신 방문해 응대 메모까지 채운다.

// 주입 시 1회용 nonce를 건네고, 그 nonce로 이름 지은 채널로만 결과를 받는다
// (chrome.scripting.executeScript({ world: 'MAIN', args: [NONCE] }).
const NONCE = crypto.randomUUID();
injectScript('src/customer_system_interceptor.ts', NONCE);
onInterceptorEvent(`customer-intercept:${NONCE}`, sendToHub);

// 사용자 식별자는 격리 월드에서 확장 자신의 세션 조회로 얻어 허브에 한 번 올린다.
// 페이지를 거치지 않는 경로이므로 메인 월드 인터셉터는 신원을 모른다.
fetchSessionInfo().then(({ loginId }) => sendToHub({ type: 'INTERCEPTED_AGENT_INFO', loginId }));

// 허브가 자동 연쇄로 보낸 명령 — 사용자 클릭이 없다.
onCommand<ReservationMemo>('DO_APPLY_RESERVATION_TO_MEMO', async (msg) => {
  const memo = (await waitForElement('textarea.memo')) as HTMLTextAreaElement | null;
  if (!memo) return report({ success: false, error: '응대 메모 입력란을 찾지 못했습니다.' });

  setValueAndNotify(memo, formatReservationMemo(msg)); // 기존 내용 뒤에 덧붙인다
  await save();
  report({ success: true });
});

// ── 인바운드 문의 알림 ─────────────────────────────────────────
// 화면을 가로채지 않는다. 같은 고객의 중복 문의는 하나로 합쳐 세고,
// 사이드바에는 뱃지 숫자만 올린다(앰비언트 알림).
onIntercepted<InboundCall[]>('INBOUND_CALLBACK', (calls) => {
  const unique = dedupeByContact(calls);
  sendToHub({ type: 'INBOUND_CALLBACK_COUNT_UPDATE', count: unique.length });
});

interface ReservationMemo { reservationNo: string; resourceCode: string }
interface InboundCall { contact: string; at: string }

declare function formatReservationMemo(msg: ReservationMemo): string;

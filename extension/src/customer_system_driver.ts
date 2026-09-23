// [pseudo-code] customer_system_driver.ts
// 고객 응대 시스템 페이지 자동화.
// 허브 명령으로 응대 메모를 채우고, 인바운드 문의 건수를 허브에 보고한다.

// 메인 월드 인터셉터를 주입하고, nonce로 이름 지은 채널로 결과를 받는다.
const CUSTOMER_NONCE = crypto.randomUUID();
injectScript('src/customer_system_interceptor.ts', CUSTOMER_NONCE);
onInterceptorEvent(`customer-intercept:${CUSTOMER_NONCE}`, sendToHub);

// 사용자 식별자를 확장 자신의 세션 조회로 얻어 허브에 한 번 올린다.
fetchSessionInfo().then(({ loginId }) => sendToHub({ type: 'INTERCEPTED_AGENT_INFO', loginId }));

// 인자: 예약 정보. 응대 메모에 반영한다.
onCommand<ReservationMemo>('DO_APPLY_RESERVATION_TO_MEMO', async (msg) => {
  const memo = (await waitForElement('textarea.memo')) as HTMLTextAreaElement | null;
  if (!memo) return report({ success: false, error: '응대 메모 입력란을 찾지 못했습니다.' });

  setValueAndNotify(memo, formatReservationMemo(msg)); // 기존 내용 뒤에 덧붙인다
  await save();
  report({ success: true });
});

// ── 인바운드 문의 알림 ─────────────────────────────────────────
// 같은 연락처의 중복 문의를 합쳐 센 뒤 건수를 허브에 올린다.
onIntercepted<InboundCall[]>('INBOUND_CALLBACK', (calls) => {
  const unique = dedupeByContact(calls);
  sendToHub({ type: 'INBOUND_CALLBACK_COUNT_UPDATE', count: unique.length });
});

interface ReservationMemo { reservationNo: string; resourceCode: string }
interface InboundCall { contact: string; at: string }

declare function formatReservationMemo(msg: ReservationMemo): string;

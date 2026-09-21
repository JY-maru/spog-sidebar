// customer_system_interceptor.ts
// [의사코드] 고객 응대 시스템 페이지의 메인 월드 인터셉터.
//
// 이 시스템은 인바운드 문의를 주기적으로 폴링한다. 확장은 폴링을 추가하지 않고,
// 페이지가 이미 보내는 요청의 응답을 읽는다.
//
// 이 파일은 신원을 다루지 않는다. 사용자 식별자(loginId)는 격리 월드가 확장 자신의
// 세션 조회로 얻어 허브에 올린다 — 메인 월드를 거치는 경로는 없다.

(function (nonce: string) {
  const CHANNEL = `customer-intercept:${nonce}`; // 주입 시점에 건네받은 1회용 nonce
  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const res = await originalFetch(...args);

    if (isInboundPoll(urlOf(args)) && res.ok) {
      const payload = await res.clone().json();
      window.dispatchEvent(new CustomEvent(CHANNEL, {
        detail: { type: 'INBOUND_CALLBACK', calls: payload.items.map(pickNeededFields) },
      }));
    }

    return res;
  };
})(INJECTED_NONCE);

declare const INJECTED_NONCE: string;

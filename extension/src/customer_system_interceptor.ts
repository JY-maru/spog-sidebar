// [pseudo-code] customer_system_interceptor.ts
// 고객 응대 시스템 페이지의 메인 월드 인터셉터.
// 페이지가 보내는 인바운드 문의 폴링의 응답을 읽어 격리 월드로 넘긴다.
//
// 인자: 주입 시 받은 nonce — 결과를 올릴 채널 이름에 쓴다.

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

declare function isInboundPoll(url: string): boolean;

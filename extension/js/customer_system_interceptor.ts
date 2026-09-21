// customer_system_interceptor.ts
// [의사코드] 고객 응대 시스템 페이지의 메인 월드 인터셉터.
//
// 이 시스템은 인바운드 문의를 주기적으로 폴링한다. 확장은 폴링을 추가하지 않고,
// 페이지가 이미 보내는 요청의 응답을 읽는다.

(function () {
  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const res = await originalFetch(...args);

    if (isInboundPoll(urlOf(args)) && res.ok) {
      const payload = await res.clone().json();
      window.postMessage({
        type: 'INBOUND_CALLBACK',
        calls: payload.items.map(pickNeededFields),
      }, location.origin);
    }

    // 사용자 식별자는 허브의 백엔드 폴링에 쓰이며 한 번만 넘긴다.
    if (isSessionInfo(urlOf(args)) && res.ok) {
      const me = await res.clone().json();
      window.postMessage({ type: 'INTERCEPTED_AGENT_INFO', loginId: me.loginId }, location.origin);
    }

    return res;
  };
})();

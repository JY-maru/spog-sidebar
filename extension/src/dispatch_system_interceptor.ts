// dispatch_system_interceptor.ts
// [의사코드] 예약·배차 시스템 페이지의 메인 월드 인터셉터.
// 역할은 case_system_interceptor.ts와 같다 — 응답을 읽어 격리 월드로 넘기기만 한다.
//
// 이 시스템은 목록 조회를 XHR로도 보내므로 fetch와 XHR 둘 다 감싼다.

(function (nonce: string) {
  const CHANNEL = `dispatch-intercept:${nonce}`; // 주입 시점에 건네받은 1회용 nonce
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await originalFetch(...args);
    if (isReservationList(urlOf(args)) && res.ok) relay('INTERCEPTED_RESERVATIONS', await res.clone().json());
    return res;
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      if (isReservationList(this.responseURL)) relay('INTERCEPTED_RESERVATIONS', parseJson(this.responseText));
    });
    return originalSend.apply(this, args);
  };

  function relay(type, payload) {
    window.dispatchEvent(new CustomEvent(CHANNEL, { detail: { type, payload: pickNeededFields(payload) } }));
  }
})(INJECTED_NONCE);

declare const INJECTED_NONCE: string;

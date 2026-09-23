// [pseudo-code] dispatch_system_interceptor.ts
// 예약·배차 시스템 페이지의 메인 월드 인터셉터.
// 목록 조회 응답을 읽어 격리 월드로 넘긴다. fetch와 XHR 두 경로를 모두 감싼다.
//
// 인자: 주입 시 받은 nonce — 결과를 올릴 채널 이름에 쓴다.

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

declare function isReservationList(url: string): boolean;

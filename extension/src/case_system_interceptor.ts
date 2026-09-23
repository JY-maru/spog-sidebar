// [pseudo-code] case_system_interceptor.ts
// 케이스 관리 시스템 페이지의 메인 월드에서 실행된다.
// 페이지의 fetch 응답을 읽어 격리 월드로 넘긴다. 판단과 상태 변경은 하지 않는다.
//
// 인자: 주입 시 받은 nonce — 결과를 올릴 CustomEvent 채널 이름에 쓴다.
// 주입: chrome.scripting.executeScript({ world: 'MAIN', args: [nonce] }).

(function (nonce: string) {
  const CHANNEL = `case-intercept:${nonce}`;
  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    // 대상 엔드포인트의 성공 응답만 처리한다.
    if (isCaseDetail(urlOf(args)) && response.ok) {
      const payload = await response.clone().json();  // clone — 페이지 쪽 소비를 방해하지 않는다
      // nonce 채널의 CustomEvent로 올린다.
      window.dispatchEvent(new CustomEvent(CHANNEL, {
        detail: { type: 'INTERCEPTED_CASE', payload: pickNeededFields(payload) }, // 필요한 필드만
      }));
    }

    return response;
  };
})(INJECTED_NONCE);

declare function isCaseDetail(url: string): boolean;

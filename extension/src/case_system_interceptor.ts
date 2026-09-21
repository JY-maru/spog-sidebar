// case_system_interceptor.ts
// [의사코드] 케이스 관리 시스템 페이지의 메인 월드에서 실행된다.
//
// 격리 월드의 콘텐츠 스크립트는 페이지 자신의 fetch를 볼 수 없다. 메인 월드에서
// 실행되는 이 파일이 응답을 읽어 격리 월드로 넘긴다.
//
// 원칙: 읽어서 넘기는 일만 한다. 판단과 상태 변경은 격리 월드와 허브의 책임이다.
//
// 주입 경로: chrome.scripting.executeScript({ world: 'MAIN', args: [nonce] }).
// 격리 월드가 주입 시점에 건네준 1회용 nonce를 채널 이름으로 쓴다.

(function (nonce: string) {
  const CHANNEL = `case-intercept:${nonce}`;
  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    // 관심 있는 엔드포인트의 성공 응답만 대상으로 한다.
    if (isCaseDetail(urlOf(args)) && response.ok) {
      const payload = await response.clone().json();  // clone — 페이지 쪽 소비를 방해하지 않는다
      // nonce로 이름 지은 채널의 CustomEvent로만 올린다.
      window.dispatchEvent(new CustomEvent(CHANNEL, {
        detail: { type: 'INTERCEPTED_CASE', payload: pickNeededFields(payload) }, // 필요한 필드만
      }));
    }

    return response;
  };
})(INJECTED_NONCE);

declare const INJECTED_NONCE: string;

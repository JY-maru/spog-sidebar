// mock_sidebar_webhook.js
// [의사코드] 사이드바 관리용 백엔드 웹훅의 모형.
//
// 스프레드시트를 저장소로 쓰는 외부 스크립트 런타임 역할을 대신한다. 그 런타임의
// 제약(동시 실행 제한, 콜드스타트, 느린 읽기)을 흉내 내, 확장 쪽 재시도·캐시
// 설계가 무엇을 전제하는지 드러낸다.

// ── 읽기: 목록과 본문을 분리해 캐시한다 ───────────────────────
// 목록은 자주·전체에게, 본문은 드물게·한 명에게 나간다. 그래서 캐시를 분리한다.
const listCache = new Map();    // loginId → 목록 (짧은 TTL)
const detailCache = new Map();  // bulletinId → 본문 (긴 TTL)

function GET_CLIENT_CONFIG({ loginId }) {
  return cached(listCache, loginId, () => ({
    version: currentVersion(),
    notices: readNotices(loginId),   // 이 사용자에게 보일 공지만
    queuePermission: readPermission(loginId),
  }));
}

function GET_BULLETIN_DETAIL({ bulletinId }) {
  return cached(detailCache, bulletinId, () => ({ content: readBody(bulletinId) }));
}

// ── 쓰기: 멱등 처리 ────────────────────────────────────────────
// 확장이 실패를 짧게 재시도하므로 같은 요청이 두 번 도착할 수 있다.
// 이미 목표 상태이면 성공으로 응답해 재시도를 안전하게 만든다.
function TOGGLE_BULLETIN_PIN({ loginId, bulletinId, pinned }) {
  const row = findRow(bulletinId);
  if (row.pinned === pinned) return ok();   // 이미 원하는 상태 → 그대로 성공
  writeRow(bulletinId, { pinned });
  invalidate(listCache, loginId);            // 다음 폴링이 새 값을 보게 한다
  return ok();
}

// TOGGLE_BULLETIN_READ, REORDER_BULLETIN_PINS도 같은 모양 — 전부 멱등.

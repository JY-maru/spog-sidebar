// backend/mock_sidebar_webhook.js
// [MOCK] SIDEBAR_MGMT_WEBHOOK이 실제로는 무엇을 하는지 보여주는 파일.
// 원본은 이게 별도 백엔드 서버가 아니라 "스프레드시트 + 경량 스크립트 런타임"
// (Google Apps Script 같은) 위에서 돈다 — 그래서 이 파일도 진짜 서버 프레임워크
// 없이, 함수 하나가 요청 하나를 처리하는 형태 그대로 옮겼다. 캐싱은 그 런타임이
// 제공하는 "TTL 붙은 공유 키-값 저장소"(모든 요청이 공유, 브라우저 로컬 아님)
// 하나만 쓰고, DB나 별도 캐시 서버는 없다.
//
// 원본에서 실제로 겪은 문제와 그 해결책을 그대로 반영한다:
//  1) 이 함수 하나를 전체 사용자(브라우저 인스턴스마다 5분 알람)가 두드리는데,
//     캐싱이 전혀 없으면 매 호출마다 시트를 선형 스캔 + 쓰기까지 해서, 사용자가
//     늘수록 요청이 몰릴 때 런타임의 동시실행 제한에 걸려 정상 응답 대신 HTML
//     에러 페이지를 돌려주는 사고로 이어졌다("시트 전송 실패"로 오인됨).
//  2) 목록(공지 제목/큐권한)과 상세 본문을 같은 캐시 덩어리에 담았더니, 본문이
//     길어질수록 캐시 값 크기 한도(이 런타임은 키 1개당 100KB)에 조용히 부딪혀
//     캐싱 자체가 통째로 무효화되는 문제 — 목록/본문을 서로 다른 캐시로 분리하고,
//     본문은 "그 항목 하나만 열람할 때"만 별도 조회하도록 바꿨다.

const CACHE_TTL_SEC = { LIST: 60, DETAIL: 1200 }; // 목록 60초(폴링 주기와 매칭) / 본문 20분(거의 안 바뀜)
const LIST_CACHE_KEY = 'SIDEBAR_LIST_CACHE_V1';
const SIZE_WARN_BYTES = 90_000; // 캐시 값 상한(100KB)에 근접하면 경고만 남김 — 아직 실제로 넘은 적 없는
                                 // 투기적 문제라 청킹/분할 저장 같은 구조는 미리 만들지 않았다(YAGNI)

const _sharedCache = new Map(); // [MOCK] 런타임이 주는 공유 캐시 흉내. 실제로는
                                 // 요청 프로세스 경계를 넘어 여러 사용자가 공유하는 저장소.
function cacheGet(key) {
  const e = _sharedCache.get(key);
  if (!e || e.expiresAt < Date.now()) return null;
  return e.value;
}
function cachePut(key, value, ttlSec) {
  _sharedCache.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}
function cacheInvalidate(key) {
  _sharedCache.delete(key);
}

// ── 목록(공용 부분) 캐시 — 로그인ID 무관, 전체 사용자 공유 ──
function getSharedListCached() {
  const cached = cacheGet(LIST_CACHE_KEY);
  if (cached) return cached;

  const permMap = readAllQueuePermissionsFromSheet_();       // { loginId: boolean }
  const bulletins = readActiveBulletinsFromSheet_();         // 본문(content) 제외 — id/title/date/category만

  const payload = { permMap, bulletins };
  const size = byteLength_(JSON.stringify(payload));
  if (size > SIZE_WARN_BYTES) {
    console.error(`[mock-backend] 목록 캐시 ${size}B — 100KB 한도 근접. 지난 공지 비활성화 검토 필요`);
  }
  cachePut(LIST_CACHE_KEY, payload, CACHE_TTL_SEC.LIST);
  return payload;
}

// ── 진입점: GET_CLIENT_CONFIG — 개인화 필드(읽음/고정 여부, 접속버전)는 캐시
//    없이 그 사용자 행 1개만 매번 라이브로 읽는다(저비용 작업이라 캐싱 불필요) ──
function handleGetClientConfig(query) {
  const { loginId, clientVersion } = query;
  const shared = getSharedListCached();

  let queueEnabled = true; // 기존 등록자 기본값(fail-open)
  if (loginId) {
    if (Object.prototype.hasOwnProperty.call(shared.permMap, loginId)) {
      queueEnabled = shared.permMap[loginId];
    } else {
      // 캐시에 없음 — 진짜 신규이거나, 방금 다른 요청이 등록했는데 캐시가 아직
      // 못 따라온 경우. 후자를 신규로 오인해 중복 등록하지 않도록 시트를 한 번
      // 더 확인한다(신규 사용자만 타는 드문 경로라 비용 문제 없음).
      const real = readQueuePermissionFromSheet_(loginId);
      if (real === null) {
        appendQueuePermissionRow_(loginId, false);
        queueEnabled = false;
        cacheInvalidate(LIST_CACHE_KEY); // 다음 요청부턴 캐시도 갱신되게
      } else {
        queueEnabled = real;
      }
    }
  }

  const userState = getOrCreateUserStateRow_(loginId);
  // 접속버전/시각은 값이 실제로 바뀌었을 때만 쓴다 — 폴링마다 무조건 쓰기를
  // 하면 이게 이 핸들러 안에서 유일하게 발생하는 시트 "쓰기"라 동시 폴링이
  // 몰릴 때 락 대기의 주범이 됐다.
  if (userState.lastVersion !== clientVersion) writeUserVersion_(loginId, clientVersion);
  if (Date.now() - userState.lastSeenAt > 10 * 60 * 1000) writeUserLastSeen_(loginId);

  const bulletins = shared.bulletins.map((b) => ({
    ...b,
    isRead: userState.readIds.includes(b.id),
    isPinned: userState.pinnedIds.includes(b.id),
    pinnedOrder: userState.pinnedIds.indexOf(b.id),
  })).sort((a, b) => Number(b.isPinned) - Number(a.isPinned));

  return { status: 'success', queueEnabled, bulletins };
}

// ── 진입점: GET_BULLETIN_DETAIL — 본문 하나만, id별 별도 캐시로 ──
function handleGetBulletinDetail(query) {
  const { bulletinId } = query;
  const key = `BULLETIN_DETAIL_${bulletinId}`;
  const cached = cacheGet(key);
  if (cached !== null) return { status: 'success', content: cached };

  const content = readBulletinContentFromSheet_(bulletinId); // 그 행 하나만 읽음(시트 전체 스캔 없음)
  cachePut(key, content, CACHE_TTL_SEC.DETAIL);
  return { status: 'success', content };
}

// ── 진입점: 고정/읽음/재정렬 쓰기 — 전부 "이미 목표 상태면 손대지 않는다"는
//    멱등 규칙을 지킨다. 재시도(네트워크 재시도, 중복 전송)가 들어와도 안전 ──
function handleToggleBulletinPin(body) {
  const state = getOrCreateUserStateRow_(body.loginId);
  const ids = body.pinned
    ? (state.pinnedIds.includes(body.bulletinId) ? state.pinnedIds : [...state.pinnedIds, body.bulletinId])
    : state.pinnedIds.filter((id) => id !== body.bulletinId);
  writeUserPinnedIds_(body.loginId, ids);
  return { status: 'success' };
}
function handleToggleBulletinRead(body) {
  const state = getOrCreateUserStateRow_(body.loginId);
  const ids = body.read
    ? (state.readIds.includes(body.bulletinId) ? state.readIds : [...state.readIds, body.bulletinId])
    : state.readIds.filter((id) => id !== body.bulletinId);
  writeUserReadIds_(body.loginId, ids);
  return { status: 'success' };
}
function handleReorderBulletinPins(body) {
  writeUserPinnedIds_(body.loginId, body.orderedIds); // 이미 정렬된 목록을 그대로 덮어쓰기 — 몇 번을 반복해도 결과 동일(멱등)
  return { status: 'success' };
}

function byteLength_(str) {
  return new TextEncoder().encode(str).length; // 한글은 글자당 3바이트 — 문자열 length로 재면 과소평가되는 함정
}

// readAllQueuePermissionsFromSheet_ / readActiveBulletinsFromSheet_ / readQueuePermissionFromSheet_ /
// appendQueuePermissionRow_ / getOrCreateUserStateRow_ / writeUserVersion_ / writeUserLastSeen_ /
// writeUserPinnedIds_ / writeUserReadIds_ / readBulletinContentFromSheet_ — 전부 시트 I/O 스텁.
// 실제 원본은 이 부분이 스프레드시트 API 호출이고, 로직(선형 스캔/캐시 판단/쓰기 조건)이
// 이 파일이 보여주려는 핵심이라 스텁으로 남겨둔다.

// bulletin_panel.tsx
// [의사코드] 게시판 세부창(모달).
//
// 보여주는 것: 본문 온디맨드 로딩. 목록 폴링은 본문을 싣지 않고, 세부창을 열 때
// 개별로 가져온다.
//
// 렌더 규칙: 공지 본문은 웹훅에서 온 문자열이므로 언제나 텍스트로 렌더한다
// (HTML 해석 없음, dangerouslySetInnerHTML 미사용).

export function BulletinModal({ id }: { id: string }) {
  const bulletin = useBulletinStore((s) => s.byId[id]);

  useEffect(() => {
    if (!bulletin.content) fetchBulletinDetail(id); // 없을 때만 가져온다
  }, [id]);

  if (!bulletin.content) return <Skeleton />;
  return <Article {...bulletin} />;
}

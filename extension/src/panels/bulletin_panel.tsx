// [pseudo-code] bulletin_panel.tsx
// 게시판 세부창(모달). 본문은 창을 열 때 개별로 조회해 채운다.
// 공지 본문은 언제나 텍스트로 렌더한다(HTML 해석 없음).

export function BulletinModal({ id }: { id: string }) {
  const bulletin = useBulletinStore((s) => s.byId[id]);

  useEffect(() => {
    if (!bulletin.content) fetchBulletinDetail(id); // 없을 때만 가져온다
  }, [id]);

  if (!bulletin.content) return <Skeleton />;
  return <Article {...bulletin} />;
}

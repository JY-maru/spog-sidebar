// panels/bulletin_panel.tsx
// [MOCK] 게시판 세부창(모달) — 본문 온디맨드 로딩의 실제 흥미로운 부분만
// 남긴 축약본. 목록 렌더링/드래그 재정렬 UI 등 반복적인 마크업은 생략했다.
import { useCallback, useEffect, useState } from 'react';
import { fetchBulletinDetail, toggleBulletinPin, type Bulletin } from '../state/bulletin_store';

function renderBulletinMarkdown(content: string): React.ReactNode {
  // 백엔드는 셀 텍스트를 가공 없이 그대로 넘긴다 — 작성자가 셀에 마크다운
  // 문법을 직접 타이핑해서 쓰고, 해석/렌더링은 전부 클라이언트 책임이라는
  // 설계를 그대로 반영(실제 파싱 로직은 반복적인 정규식 나열이라 생략).
  return <div>{content}</div>;
}

export function BulletinDetailModal({ bulletin, onClose }: { bulletin: Bulletin | null; onClose: () => void }) {
  const bulletinId = bulletin?.id;
  const [content, setContent] = useState<string | undefined>(bulletin?.content);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(() => {
    if (!bulletinId) return;
    setLoading(true);
    setError(null);
    fetchBulletinDetail(bulletinId).then((r) => {
      setLoading(false);
      if (r.success) setContent(r.content ?? '');
      else setError(r.error || '불러오기 실패');
    });
  }, [bulletinId]);

  // 목록엔 본문이 안 실려오므로(bulletin_store.ts 참고) 열 때마다 대체로
  // 처음 조회한다. 백엔드가 바쁘면(동시실행 제한) 재시도(fetchWebhookJson,
  // service_worker.ts)까지 다 실패할 수 있어서, 무한 스피너 대신 "다시 시도"
  // 버튼을 명시적으로 둔다 — 실패를 조용히 감추지 않는다.
  useEffect(() => {
    if (!bulletin) return;
    if (bulletin.content !== undefined) { setContent(bulletin.content); return; }
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulletinId]);

  if (!bulletin) return null;
  return (
    <div className="bulletin-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bulletin-modal">
        <div className="bulletin-modal-header">
          <button onClick={() => { toggleBulletinPin(bulletin.id); onClose(); }}>{bulletin.isPinned ? '고정 해제' : '고정하기'}</button>
          <span>{bulletin.title}</span>
          <button onClick={onClose}>닫기</button>
        </div>
        <div className="bulletin-modal-body">
          {loading ? (
            <span className="spinner" />
          ) : error ? (
            <div>
              <div>불러오기 실패</div>
              <button onClick={loadDetail}>다시 시도</button>
            </div>
          ) : (
            renderBulletinMarkdown(content || '')
          )}
        </div>
      </div>
    </div>
  );
}

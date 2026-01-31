import { useParams } from "react-router-dom";
import PageEditorView from '@/components/editor/PageEditorView';

const PageEditorPage = () => {
  const { id } = useParams<{ id: string }>();
  
  // idをkeyとして設定することで、ページ遷移時（WikiLinkクリック等）に
  // PageEditorViewが完全に再マウントされ、すべての状態がリセットされる
  return <PageEditorView key={id} />;
};

export default PageEditorPage;

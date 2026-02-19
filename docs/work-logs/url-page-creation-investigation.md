# URLからページ作成：取得データが表示されない問題の調査

## 概要
WebClipper（URLからページを作成する機能）で取得したデータが、作成後のページに表示されない。

## 原因

### 1. 本文（コンテンツ）がどこにも保存されていない
- **WebClipperDialog** は `clip(url)` でHTMLを取得し、`formatClippedContentAsTiptap` で Tiptap JSON に変換して `onClipped(title, tiptapContent, sourceUrl, thumbnailUrl)` に渡している。
- **FloatingActionButton.handleWebClipped** は `createPageMutation.mutateAsync({ title, content })` のみ呼び、`content`（Tiptap JSON文字列）は createPage に渡しているが、
- **StorageAdapterPageRepository.createPage** は API に `title` と `content_preview`（本文の先頭から生成）しか送っていない。**本文そのもの（content）は API に送っていない**。
- **POST /api/pages** は `pages` テーブルにのみ挿入し、**page_contents には一切触れない**。本文は `page_contents` の Y.Doc で保持されるため、新規作成時は page_contents が存在せず 404 になる。
- 表示時は **CollaborationManager** が空の Y.Doc を用意し、`GET /api/pages/:id/content` で取得しようとするが **404** のためマージするデータがなく、**常に空のドキュメント**のままになる。

### 2. source_url / thumbnail_url が作成時に送られていない
- handleWebClipped では `sourceUrl` と `thumbnailUrl` を createPage には渡しておらず、**ナビゲーションの location.state のみ**で渡している。
- PageEditorView の useEffect で state から取り出して `updatePageMutation` で後から更新しているが、**作成時から API/DB に持たせた方が一貫している**。

### 3. 初期コンテンツをエディタに渡す経路がない
- 作成直後に `/page/:id` へ遷移する際、**取得済みの Tiptap JSON（initialContent）を location.state で渡していない**。
- エディタは **Y.Doc（CollaborationManager）** を唯一のソースとして表示するため、404 の場合は空。**initialContent を Y.Doc に一度だけ流し込む処理**が存在しない。

## 修正方針
1. **作成時に source_url / thumbnail_url を API に送る**  
   - createPage の引数（および API の body）に `sourceUrl`, `thumbnailUrl` を追加し、作成時から DB に保存する。
2. **URL作成時は initialContent を location.state で渡す**  
   - handleWebClipped で `navigate(..., { state: { sourceUrl, thumbnailUrl, initialContent: content } })` とする。
3. **エディタで initialContent を一度だけ Y.Doc に反映する**  
   - PageEditorView → PageEditorContent → TiptapEditor に `initialContent` を渡し、コラボモードかつ Y.Doc が空のときに `editor.commands.setContent(JSON.parse(initialContent))` で初期化する。反映したら state をクリアする。

## 関連ファイル
- `src/components/layout/FloatingActionButton.tsx` — handleWebClipped, 作成・遷移
- `src/lib/pageRepository/StorageAdapterPageRepository.ts` — createPage → API に渡す項目
- `src/hooks/usePageQueries.ts` — useCreatePage の引数
- `src/lib/pageRepository.ts` — IPageRepository.createPage のシグネチャ
- `terraform/modules/api/lambda/handlers/pages.mjs` — POST /api/pages（既に source_url, thumbnail_url 対応済み）
- `src/components/editor/PageEditorView.tsx` — location.state の処理
- `src/components/editor/PageEditor/PageEditorContent.tsx` — TiptapEditor に initialContent を渡す
- `src/components/editor/TiptapEditor.tsx` — initialContent を Y.Doc に一度だけ反映

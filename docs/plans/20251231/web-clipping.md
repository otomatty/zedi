# 実装計画書: Web Clipping（URL 取り込み機能）

## 概要

| 項目       | 内容                                                              |
| :--------- | :---------------------------------------------------------------- |
| **機能名** | Web Clipping（URL 取り込み機能）                                  |
| **目的**   | URL から Web ページの本文を抽出し、編集可能なページとして保存する |
| **優先度** | 🔴 必須（Phase 3 のコア機能）                                     |
| **依存**   | なし                                                              |

---

## 機能要件

### ユーザーストーリー

1. ユーザーは新規ページ作成画面を開く
2. 「URL から取り込み」ボタンをクリック、または URL を直接ペーストする
3. システムが Web ページの本文を抽出する（Reader Mode）
4. 抽出された内容がエディタに挿入される
5. タイトルは OGP または `<title>` タグから自動取得される
6. 引用元 URL は `source_url` フィールドに保存される
7. Date Grid ではクリップしたページを視覚的に区別表示する

### 抽出対象

| 要素           | 抽出方法                                    |
| :------------- | :------------------------------------------ |
| **タイトル**   | OGP `og:title` > `<title>` タグ             |
| **本文**       | Readability.js による本文抽出               |
| **サムネイル** | OGP `og:image`                              |
| **説明**       | OGP `og:description` > `<meta description>` |
| **引用元 URL** | 入力された URL をそのまま保存               |

---

## UI 設計

### トリガー方法

1. **新規ページ作成画面**: 「🔗 URL から取り込み」ボタン
2. **URL ペースト検知**: エディタに URL をペーストした際に自動提案

### 新規ページ作成画面

```
┌─────────────────────────────────────────────────────────────┐
│  ← 新規ページ                                    [保存]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────┐ ┌──────────────────────┐         │
│  │ ✨ Wiki 生成          │ │ 🔗 URL から取り込み  │         │
│  └──────────────────────┘ └──────────────────────┘         │
│                                                             │
│  タイトル                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ─────────────────────────────────────────────────────     │
│                                                             │
│  [エディタ領域]                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### URL 入力ダイアログ

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  🔗 URL から取り込み                                  [×]   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ https://example.com/article/...                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  💡 Web ページの本文を抽出してページとして保存します。       │
│     引用元 URL は自動的に記録されます。                     │
│                                                             │
│                              [キャンセル]  [取り込み]       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 取り込み中の表示

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ⏳ 取り込み中...                                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  📄 ページを取得中...                               │   │
│  │  └─ 🔍 本文を抽出中...                              │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [キャンセル]                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Date Grid での表示

```
┌──────────┐
│ 🔗       │  ← クリップページには🔗アイコンを表示
│ [thumb]  │
│ 記事タイ │
│ トル...  │
└──────────┘
```

### ページエディタでの引用元表示

```
┌─────────────────────────────────────────────────────────────┐
│  ← 機械学習入門ガイド                            [⋯]       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔗 引用元: https://example.com/ml-guide  [開く]           │
│                                                             │
│  ─────────────────────────────────────────────────────     │
│                                                             │
│  [本文コンテンツ]                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 技術設計

### アーキテクチャ

Web ページの取得は CORS の制約があるため、以下のアプローチを使用：

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │ --> │  CORS Proxy  │ --> │  Target URL  │
│   (Client)   │     │  or Backend  │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

#### 方式 A: CORS プロキシ（Web App 用）

```typescript
// lib/webClipper.ts
const CORS_PROXY = "https://api.allorigins.win/raw?url=";

async function fetchWithProxy(url: string): Promise<string> {
  const response = await fetch(CORS_PROXY + encodeURIComponent(url));
  if (!response.ok) {
    throw new Error("ページの取得に失敗しました");
  }
  return response.text();
}
```

#### 方式 B: サーバーレス関数（推奨）

Vercel Edge Functions や Cloudflare Workers を使用：

```typescript
// api/fetch-page.ts (Vercel Edge Function)
export default async function handler(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return new Response("URL is required", { status: 400 });
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ZediBot/1.0)",
    },
  });

  const html = await response.text();
  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

### 本文抽出（Readability.js）

```typescript
// lib/webClipper.ts
import { Readability } from "@mozilla/readability";

export interface ClippedContent {
  title: string;
  content: string; // HTML 形式
  textContent: string; // プレーンテキスト
  excerpt: string; // 要約
  byline: string | null; // 著者
  siteName: string | null; // サイト名
  thumbnailUrl: string | null;
  sourceUrl: string;
}

export async function clipWebPage(url: string): Promise<ClippedContent> {
  // 1. HTML を取得
  const html = await fetchWithProxy(url);

  // 2. DOM をパース
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // 3. OGP 情報を抽出
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content");
  const ogDescription = doc
    .querySelector('meta[property="og:description"]')
    ?.getAttribute("content");

  // 4. Readability で本文抽出
  const reader = new Readability(doc);
  const article = reader.parse();

  if (!article) {
    throw new Error("本文の抽出に失敗しました");
  }

  return {
    title: ogTitle || article.title || doc.title || "無題",
    content: article.content,
    textContent: article.textContent,
    excerpt: ogDescription || article.excerpt || "",
    byline: article.byline,
    siteName: article.siteName,
    thumbnailUrl: ogImage || null,
    sourceUrl: url,
  };
}
```

### HTML → Tiptap 変換

```typescript
// lib/htmlToTiptap.ts
import { generateJSON } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";

export function htmlToTiptapJSON(html: string): object {
  // 不要なタグを除去
  const cleanHtml = sanitizeHtml(html);

  // Tiptap JSON に変換
  return generateJSON(cleanHtml, [StarterKit]);
}

function sanitizeHtml(html: string): string {
  // script, style, iframe 等を除去
  const div = document.createElement("div");
  div.innerHTML = html;

  // 不要な要素を削除
  const unwanted = div.querySelectorAll("script, style, iframe, noscript");
  unwanted.forEach((el) => el.remove());

  return div.innerHTML;
}
```

### データベース保存

```typescript
// hooks/useWebClipper.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clipWebPage } from "@/lib/webClipper";
import { htmlToTiptapJSON } from "@/lib/htmlToTiptap";
import { useCreatePage } from "./usePageQueries";

export function useWebClipper() {
  const createPage = useCreatePage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (url: string) => {
      // 1. Web ページを取り込み
      const clipped = await clipWebPage(url);

      // 2. HTML を Tiptap JSON に変換
      const tiptapContent = htmlToTiptapJSON(clipped.content);

      // 3. ページとして保存
      const page = await createPage.mutateAsync({
        title: clipped.title,
        content: JSON.stringify(tiptapContent),
        sourceUrl: clipped.sourceUrl,
        thumbnailUrl: clipped.thumbnailUrl,
      });

      return page;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
  });
}
```

---

## ファイル構成

```
src/
├── lib/
│   ├── webClipper.ts             # Web取り込みロジック（新規）
│   └── htmlToTiptap.ts           # HTML→Tiptap変換（新規）
├── hooks/
│   └── useWebClipper.ts          # Web取り込みフック（新規）
├── components/
│   ├── editor/
│   │   ├── WebClipperButton.tsx  # 取り込みボタン（新規）
│   │   └── SourceUrlBadge.tsx    # 引用元表示（新規）
│   └── page/
│       └── PageCard.tsx          # クリップアイコン追加（修正）
└── types/
    └── page.ts                   # sourceUrl フィールド追加（修正）
```

---

## 実装ステップ

| Step | 内容                                   | 見積もり |
| :--- | :------------------------------------- | :------- |
| 1    | CORS プロキシまたは Edge Function 設定 | 1 時間   |
| 2    | Readability.js による本文抽出          | 1.5 時間 |
| 3    | OGP 情報抽出                           | 30 分    |
| 4    | HTML → Tiptap JSON 変換                | 1.5 時間 |
| 5    | URL 入力ダイアログ UI                  | 1 時間   |
| 6    | Web Clipper フック                     | 1 時間   |
| 7    | エディタへの統合                       | 1 時間   |
| 8    | 引用元 URL 表示 UI                     | 30 分    |
| 9    | Date Grid でのアイコン表示             | 30 分    |
| 10   | エラーハンドリング                     | 1 時間   |
| 11   | テストと調整                           | 1.5 時間 |

**合計見積もり: 約 11 時間**

---

## 依存パッケージ

```bash
bun add @mozilla/readability
```

---

## エラーハンドリング

| エラー             | 表示メッセージ                                                             |
| :----------------- | :------------------------------------------------------------------------- |
| 無効な URL         | 「有効な URL を入力してください。」                                        |
| ページ取得失敗     | 「ページの取得に失敗しました。URL を確認してください。」                   |
| 本文抽出失敗       | 「本文の抽出に失敗しました。このページは対応していない可能性があります。」 |
| ネットワークエラー | 「ネットワークエラーが発生しました。接続を確認してください。」             |
| タイムアウト       | 「ページの取得に時間がかかっています。再試行してください。」               |

---

## セキュリティ考慮事項

1. **XSS 対策**: HTML サニタイズを徹底（script, style, iframe 除去）
2. **URL 検証**: 有効な HTTP/HTTPS URL のみ許可
3. **プロキシ制限**: 信頼できるドメインのみプロキシ経由でアクセス
4. **レート制限**: 連続取り込みの制限を設ける

---

## 将来の拡張

1. **ブラウザ拡張機能**: Chrome/Firefox 拡張で直接取り込み
2. **選択テキストクリップ**: Web ページの一部のみを取り込み
3. **PDF 対応**: PDF URL からテキスト抽出
4. **YouTube 対応**: 動画の説明文や字幕を取り込み

---

## 関連ドキュメント

- [PRD: 2.4.1 Web クリッピング機能](../PRD.md#241-web-クリッピング機能検討中)

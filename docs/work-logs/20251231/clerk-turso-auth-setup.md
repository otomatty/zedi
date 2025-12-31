# 作業ログ: Clerk + Turso認証の実装

**日付:** 2025年12月31日  
**作業者:** AI Assistant  
**目的:** PRDに従い、ClerkとTursoを使用したユーザー認証を実装

---

## 実施内容

### 1. パッケージのインストール

```bash
bun add @clerk/clerk-react@latest @libsql/client
```

インストールされたバージョン:
- `@clerk/clerk-react@5.59.2`
- `@libsql/client@0.15.15`

---

### 2. 環境変数の設定

#### 作成ファイル: `.env.local`

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_TURSO_DATABASE_URL=libsql://...
VITE_TURSO_AUTH_TOKEN=...
```

#### 作成ファイル: `.env.example`

開発者向けのテンプレートファイルを作成（実際の値はプレースホルダー）

---

### 3. 変更・作成したファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/main.tsx` | `ClerkProvider`でアプリ全体をラップ |
| `src/vite-env.d.ts` | 環境変数の型定義を追加 |
| `src/components/layout/Header.tsx` | サインインボタン・UserButtonを追加 |
| `src/lib/turso.ts` | Tursoクライアント設定（新規作成） |
| `src/hooks/useTurso.ts` | Clerk JWTを使用したTurso認証フック（新規作成） |
| `src/components/auth/ProtectedRoute.tsx` | 認証保護ルートコンポーネント（新規作成） |

---

### 4. 実装詳細

#### 4.1 `src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App.tsx";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk Publishable Key");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <App />
    </ClerkProvider>
  </StrictMode>
);
```

#### 4.2 `src/lib/turso.ts`

Tursoクライアントを作成するユーティリティ関数:
- `createTursoClient()` - 基本的なTursoクライアント
- `createAuthenticatedTursoClient(jwtToken)` - Clerk JWTを使用した認証付きクライアント
- `getTursoClient()` - シングルトンクライアント

#### 4.3 `src/hooks/useTurso.ts`

カスタムフック:
- `useTurso()` - 認証状態に応じたTursoクライアントを取得
- `useUserId()` - 現在のユーザーIDを取得

#### 4.4 `src/components/auth/ProtectedRoute.tsx`

- `ProtectedRoute` - 認証が必要なルートを保護
- `AuthGate` - 認証状態に応じて異なるコンテンツを表示

#### 4.5 `src/components/layout/Header.tsx`

Clerkの認証UIコンポーネントを追加:
- `<SignedOut>` + `<SignInButton>` - 未認証時にサインインボタンを表示
- `<SignedIn>` + `<UserButton>` - 認証済み時にユーザーアバターを表示

---

## 残タスク

以下の設定は手動で行う必要があります:

1. **Clerk JWT Template設定** → `docs/plans/20251231/clerk-jwt-template-setup.md` を参照
2. **Turso JWKS設定** - Clerk JWKS URLをTursoに登録

---

## 参考リンク

- [Clerk React Quickstart](https://clerk.com/docs/react/getting-started/quickstart)
- [Turso Authorization Quickstart](https://docs.turso.tech/connect/authorization)

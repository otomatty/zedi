/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";

/**
 * Server-rendered landing page (hono/jsx on the Worker, no client JS).
 * Worker 上で hono/jsx により描画する公開ページ（クライアント JS なし）。
 */
export const Landing: FC = () => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Zedi</title>
      <style>{`body{font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.7}a{color:#2563eb}`}</style>
    </head>
    <body>
      <h1>Zedi</h1>
      <p>
        このページは Worker 上で <code>hono/jsx</code> によりサーバー描画されています。アプリ本体は
        <code>hono/jsx/dom</code> の SPA です。
      </p>
      <p>
        <a href="/notes">アプリを開く</a>
      </p>
    </body>
  </html>
);

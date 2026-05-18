/**
 * Zedi Extension - shared constants / Zedi 拡張 - 共有定数
 *
 * `self` is defined in both window (popup) and service worker contexts, so
 * this single file can be loaded via `<script>` from `popup.html` and via
 * `importScripts()` from `background.js`.
 *
 * `self` は popup ウィンドウとサービスワーカーの両方で参照できるため、本
 * ファイルは `popup.html` の `<script>` 読み込みと、`background.js` の
 * `importScripts()` の両方で利用できる。
 */
self.ZEDI_EXT_CONSTANTS = Object.freeze({
  // クリップフローのフォールバック先パス（ログイン状態でも未認証でも辿り着く）。
  // Path used as the clip-flow fallback (reachable signed-in or not).
  CLIP_PATH: "/notes/me",
});

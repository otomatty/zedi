/**
 * `@zedi/shared` のエントリ。サーバ／クライアント／管理画面すべてで共有可能な
 * ピュアな定数だけをここに集約する。React や Node 専用 API には依存しない。
 *
 * Entry point for `@zedi/shared`. Holds pure constants that can be imported
 * from server, client, and admin code alike. Must not depend on React or
 * Node-only APIs so the package stays universally importable.
 */
export { TAG_NAME_CHAR_CLASS } from "./tagCharacterClass.js";

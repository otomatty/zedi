/**
 * Imperative handle for slash menu keyboard forwarding from the editor.
 * エディタからスラッシュメニューへキーボードを渡すための命令型ハンドル。
 */
export interface SlashSuggestionHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

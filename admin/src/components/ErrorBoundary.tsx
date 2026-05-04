import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { captureException } from "@/lib/sentry";

interface ErrorBoundaryProps {
  /** 通常時に描画する子ツリー / Children rendered while no error has been caught */
  children: ReactNode;
  /**
   * エラー時に描画するフォールバック。`reset` で内部状態をリセットする。
   * Optional render-prop for the fallback UI; `reset` clears the error so
   * children can mount again.
   */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 子ツリーで発生した未捕捉例外をキャッチし Sentry に通知する境界。
 * フォールバック未指定時はミニマルなエラーメッセージを描画する。
 *
 * Error boundary that catches unhandled exceptions from its subtree, forwards
 * them to Sentry via `@/lib/sentry`, and renders a fallback UI in their place.
 *
 * @see https://github.com/otomatty/zedi/issues/804
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  /** React の標準 Error Boundary API。/ React's standard Error Boundary hook. */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  /** 例外を Sentry に転送する。/ Forward the caught exception to Sentry. */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sentry が未初期化でも落ちないよう、helper 経由でガードする。
    // `componentStack` を `extra` に載せて、どのコンポーネントツリーで発生したかを
    // Sentry イベントに残す。
    //
    // Route through the helper so an uninitialized Sentry SDK still no-ops cleanly.
    // Forward `componentStack` so the Sentry event records which subtree threw.
    try {
      captureException(error, {
        extra: { componentStack: info.componentStack ?? undefined },
      });
    } catch {
      // 失敗時もフォールバック描画は継続する。
      // Continue rendering the fallback even if reporting fails.
    }
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught:", error, info.componentStack);
    }
  }

  /** フォールバックから内部状態をクリアする。/ Clear the captured error so children can mount. */
  reset = (): void => {
    this.setState({ error: null });
  };

  /** フォールバック / 子ツリーを切り替えて描画する。/ Render either the fallback or the children. */
  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback({ error, reset: this.reset });
      }
      return (
        <div role="alert" className="p-4 text-sm">
          <p className="font-semibold">Something went wrong.</p>
          <p className="text-muted-foreground mt-1 text-xs">{error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

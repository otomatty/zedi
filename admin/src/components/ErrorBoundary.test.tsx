import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

const captureException = vi.fn();
vi.mock("@/lib/sentry", () => ({
  captureException: (error: unknown) => captureException(error),
}));

/**
 * 任意の `Error` を render 時に投げるテスト用コンポーネント。
 * Helper that throws on render so the boundary's catch path executes.
 */
function Boom({ error }: { error: Error }): never {
  throw error;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    captureException.mockReset();
    // React ボイラープレートのコンソール出力を抑制（テスト出力を読みやすく）。
    // Suppress React's expected error log so test output stays readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <div>safe content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("safe content")).toBeInTheDocument();
  });

  it("unmounts the failing subtree and renders the fallback when a child throws", () => {
    const error = new Error("boom!");
    render(
      <ErrorBoundary
        fallback={({ error: caught }) => <div role="alert">caught: {caught.message}</div>}
      >
        <Boom error={error} />
      </ErrorBoundary>,
    );

    // フォールバックが描画され、子ツリーは unmount されている。
    // The fallback renders and the failing subtree is gone.
    expect(screen.getByRole("alert")).toHaveTextContent("caught: boom!");
  });

  it("forwards the caught exception to Sentry via captureException", () => {
    const error = new Error("explode");
    render(
      <ErrorBoundary fallback={() => <div role="alert">fallback</div>}>
        <Boom error={error} />
      </ErrorBoundary>,
    );

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("renders a default fallback when no fallback prop is provided", () => {
    render(
      <ErrorBoundary>
        <Boom error={new Error("default-fallback")} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/Something went wrong/);
    expect(screen.getByText("default-fallback")).toBeInTheDocument();
  });
});

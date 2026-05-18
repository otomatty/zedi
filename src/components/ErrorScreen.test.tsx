/**
 * ErrorScreen のユニットテスト。i18n のキーが描画され、アクションが期待通り
 * 機能することを確認する。
 *
 * Unit tests for ErrorScreen — assert that i18n keys render and the reload /
 * home actions behave as expected.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ErrorScreen from "./ErrorScreen";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

describe("ErrorScreen", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the unexpected-error title and description via i18n keys", () => {
    render(
      <MemoryRouter>
        <ErrorScreen error={new Error("boom")} />
      </MemoryRouter>,
    );
    expect(screen.getByText("errors.unexpectedTitle")).toBeInTheDocument();
    expect(screen.getByText("errors.unexpectedDescription")).toBeInTheDocument();
  });

  it("exposes role=alert on the root container for assistive tech", () => {
    render(
      <MemoryRouter>
        <ErrorScreen error={new Error("boom")} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows the error message inside a collapsible details element", () => {
    render(
      <MemoryRouter>
        <ErrorScreen error={new Error("kaboom-details")} />
      </MemoryRouter>,
    );
    // <details><summary> のラベルとエラーメッセージが含まれる。
    // The disclosure label and the underlying error message are both present.
    expect(screen.getByText("errors.unexpectedDetails")).toBeInTheDocument();
    expect(screen.getByText("kaboom-details")).toBeInTheDocument();
  });

  it("invokes window.location.reload when the reload button is clicked", async () => {
    const reload = vi.fn();
    // jsdom の location.reload は readonly。getter を差し替えてモックする。
    // jsdom's location.reload is readonly, so swap the getter to mock it.
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload },
    });

    try {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <ErrorScreen error={new Error("boom")} />
        </MemoryRouter>,
      );

      await user.click(screen.getByRole("button", { name: "errors.actionReload" }));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it("renders a home link pointing to /", () => {
    render(
      <MemoryRouter>
        <ErrorScreen error={new Error("boom")} />
      </MemoryRouter>,
    );
    const home = screen.getByRole("link", { name: /errors\.actionBackToHome/ });
    expect(home).toHaveAttribute("href", "/");
  });
});

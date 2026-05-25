import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageActionHubFab } from "./PageActionHubFab";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "editor.pageActionHub.openAriaLabel": "Open page actions",
      };
      return map[key] ?? key;
    },
    i18n: { language: "en" },
  }),
}));

describe("PageActionHubFab", () => {
  it("canEdit かつ isSignedIn のときボタンを描画 / renders the button when allowed", () => {
    render(<PageActionHubFab canEdit isSignedIn onOpen={vi.fn()} />);
    expect(screen.getByTestId("page-action-hub-fab")).toBeInTheDocument();
    expect(screen.getByLabelText("Open page actions")).toBeInTheDocument();
  });

  it("canEdit=false では null を返す / returns null when not editable", () => {
    const { container } = render(<PageActionHubFab canEdit={false} isSignedIn onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("isSignedIn=false では null を返す / returns null when signed out", () => {
    const { container } = render(<PageActionHubFab canEdit isSignedIn={false} onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("クリックで onOpen を呼ぶ / clicking calls onOpen", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<PageActionHubFab canEdit isSignedIn onOpen={onOpen} />);

    await user.click(screen.getByTestId("page-action-hub-fab"));
    expect(onOpen).toHaveBeenCalled();
  });
});

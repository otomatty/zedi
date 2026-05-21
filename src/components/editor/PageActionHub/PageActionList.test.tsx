import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Image as ImageIcon, Wand2 } from "lucide-react";
import { PageActionList } from "./PageActionList";
import type { PageAction, PageActionContext } from "./types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "editor.pageActionHub.emptyState": "No actions available",
        "editor.pageActionHub.actions.thumbnailSearch.label": "Search image",
        "editor.pageActionHub.actions.thumbnailSearch.description": "Search and insert",
        "editor.pageActionHub.actions.thumbnailGenerate.label": "Generate with AI",
        "editor.pageActionHub.actions.thumbnailGenerate.description": "Generate and insert",
      };
      return map[key] ?? key;
    },
    i18n: { language: "en" },
  }),
}));

const ctx: PageActionContext = {
  pageTitle: "Test Page",
  isReadOnly: false,
  isSignedIn: true,
  hasThumbnail: false,
  insertThumbnail: vi.fn(),
};

const StubComponent: React.FC = () => null;

const actions: PageAction[] = [
  {
    id: "thumbnail.search",
    labelI18nKey: "editor.pageActionHub.actions.thumbnailSearch.label",
    descriptionI18nKey: "editor.pageActionHub.actions.thumbnailSearch.description",
    icon: ImageIcon,
    category: "thumbnail",
    insertStrategy: "head",
    isAvailable: () => true,
    Component: StubComponent,
  },
  {
    id: "thumbnail.generate",
    labelI18nKey: "editor.pageActionHub.actions.thumbnailGenerate.label",
    descriptionI18nKey: "editor.pageActionHub.actions.thumbnailGenerate.description",
    icon: Wand2,
    category: "thumbnail",
    insertStrategy: "head",
    isAvailable: () => true,
    Component: StubComponent,
  },
];

describe("PageActionList", () => {
  it("利用可能なアクションをカード表示する / renders one button per action", () => {
    render(<PageActionList ctx={ctx} actions={actions} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Search image/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate with AI/ })).toBeInTheDocument();
  });

  it("カードクリックで onSelect(id) を呼ぶ / clicking calls onSelect with the id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PageActionList ctx={ctx} actions={actions} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /Search image/ }));
    expect(onSelect).toHaveBeenCalledWith("thumbnail.search");
  });

  it("空配列のときは emptyState を表示 / shows empty state when no actions", () => {
    render(<PageActionList ctx={ctx} actions={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("No actions available")).toBeInTheDocument();
  });
});

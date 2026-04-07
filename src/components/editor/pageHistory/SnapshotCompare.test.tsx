/**
 * SnapshotCompare コンポーネントのテスト
 * Tests for the SnapshotCompare component
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SnapshotCompare } from "./SnapshotCompare";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "editor.pageHistory.selectedVersion": "選択バージョン",
        "editor.pageHistory.currentVersion": "現在のバージョン",
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock("./SnapshotPreview", () => ({
  SnapshotPreview: ({ ydocState }: { ydocState: string }) => (
    <div data-testid="snapshot-preview">{`preview:${ydocState.slice(0, 10)}`}</div>
  ),
}));

describe("SnapshotCompare", () => {
  it("選択バージョンと現在バージョンの2つのプレビューを表示する / renders two side-by-side previews", () => {
    render(
      <SnapshotCompare
        selectedYdocState="selected-state-base64"
        currentYdocState="current-state-base64"
      />,
    );

    expect(screen.getByText("選択バージョン")).toBeInTheDocument();
    expect(screen.getByText("現在のバージョン")).toBeInTheDocument();

    const previews = screen.getAllByTestId("snapshot-preview");
    expect(previews).toHaveLength(2);
  });

  it("SnapshotPreview に正しい ydocState が渡される / passes correct ydocState to each preview", () => {
    render(<SnapshotCompare selectedYdocState="AAAA" currentYdocState="BBBB" />);

    const previews = screen.getAllByTestId("snapshot-preview");
    expect(previews[0]?.textContent).toContain("AAAA");
    expect(previews[1]?.textContent).toContain("BBBB");
  });
});

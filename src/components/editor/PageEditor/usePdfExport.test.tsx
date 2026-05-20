import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockDownloadPdf, mockToast } = vi.hoisted(() => ({
  mockDownloadPdf: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock("@/lib/tiptapToHtml", () => ({
  downloadPdf: (...args: unknown[]) => mockDownloadPdf(...args),
}));

vi.mock("@zedi/ui", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      if (typeof fallback === "string") return fallback;
      return key;
    },
  }),
}));

import { usePdfExport } from "./usePdfExport";

function HookHarness({
  title,
  content,
  sourceUrl,
}: {
  title: string;
  content: string;
  sourceUrl?: string | null;
}) {
  const { handleExportPdf } = usePdfExport(title, content, sourceUrl ?? null);
  return (
    <button type="button" onClick={handleExportPdf}>
      export
    </button>
  );
}

describe("usePdfExport", () => {
  beforeEach(() => {
    mockDownloadPdf.mockReset();
    mockToast.mockReset();
  });

  it("delegates to downloadPdf with title / content / sourceUrl and i18n options", async () => {
    mockDownloadPdf.mockResolvedValueOnce(undefined);
    render(<HookHarness title="My Page" content="{}" sourceUrl="https://example.com/article" />);

    fireEvent.click(screen.getByText("export"));

    await waitFor(() => {
      expect(mockDownloadPdf).toHaveBeenCalledTimes(1);
    });
    const [title, content, sourceUrl, options] = mockDownloadPdf.mock.calls[0] ?? [];
    expect(title).toBe("My Page");
    expect(content).toBe("{}");
    expect(sourceUrl).toBe("https://example.com/article");
    expect(options).toMatchObject({
      defaultTitle: "notes.untitledPage",
      attributionLabel: "editor.pdfExport.sourceAttribution",
    });
  });

  it("fires the success toast after downloadPdf resolves", async () => {
    mockDownloadPdf.mockResolvedValueOnce(undefined);
    render(<HookHarness title="t" content="c" sourceUrl={null} />);

    fireEvent.click(screen.getByText("export"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: "editor.pdfExport.downloaded",
      });
    });
  });

  it("fires a destructive toast when downloadPdf rejects", async () => {
    mockDownloadPdf.mockRejectedValueOnce(new Error("boom"));
    render(<HookHarness title="t" content="c" sourceUrl={null} />);

    fireEvent.click(screen.getByText("export"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: "editor.pdfExport.failed",
        variant: "destructive",
      });
    });
  });
});

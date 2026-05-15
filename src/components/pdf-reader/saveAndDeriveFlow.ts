/**
 * `[保存して新規ページ]` のフロー本体を React コンポーネントから切り出した純粋関数。
 *
 * The derive-page flow extracted from {@link PdfReader} so it can be unit
 * tested without spinning up the full pdf.js + selection machinery. Takes
 * the create / derive mutations as plain async functions, builds the title /
 * `templateContent`, calls them in order, and navigates to the new page.
 *
 * 戻り値 / Return:
 *   - 成功時: `{ status: "ok", pageId }`
 *   - 派生がすでにある場合: `{ status: "alreadyDerived", pageId }`
 *   - 失敗時: `{ status: "error", error }`
 */
import {
  buildDerivedPageTemplate,
  buildDerivedPageTitle,
} from "@/lib/pdfKnowledge/derivedPageTemplate";
import type {
  CreatePdfHighlightBody,
  DerivePageBody,
  DerivePageResponse,
  PdfHighlight,
} from "@/lib/pdfKnowledge/highlightsApi";

/**
 * Navigation function compatible with React Router's `useNavigate()` return value.
 * `useNavigate` 互換のナビゲータ。
 */
export type NavigateFn = (
  to: string,
  options?: { state?: { initialContent: string } | null },
) => void;

/** Input to {@link runSaveAndDeriveFlow}. */
export interface SaveAndDeriveFlowInput {
  sourceId: string;
  /** Body for `createPdfHighlight`. */
  createBody: CreatePdfHighlightBody;
  /** Filename or other display name used in the citation line. */
  displayName?: string;
  /** Mutation: create highlight. */
  createHighlight: (body: CreatePdfHighlightBody) => Promise<{ highlight: PdfHighlight }>;
  /** Mutation: derive page from highlight. */
  derivePage: (params: {
    highlightId: string;
    body: DerivePageBody;
  }) => Promise<DerivePageResponse>;
  /** React Router navigate. */
  navigate: NavigateFn;
}

/** Result returned by {@link runSaveAndDeriveFlow}. */
export type SaveAndDeriveFlowResult =
  | { status: "ok"; pageId: string }
  | { status: "alreadyDerived"; pageId: string }
  | { status: "error"; error: Error };

/**
 * Run the full save-then-derive flow and navigate to the resulting page.
 *
 * フローを実行し、派生ページに遷移する。テンプレートが未設定（再派生で
 * `alreadyDerived: true`）の場合は `state` を渡さず、エディタ側の seed を
 * 不要にする。
 */
export async function runSaveAndDeriveFlow(
  input: SaveAndDeriveFlowInput,
): Promise<SaveAndDeriveFlowResult> {
  try {
    const { highlight } = await input.createHighlight(input.createBody);
    const title = buildDerivedPageTitle({
      highlightText: highlight.text,
      displayName: input.displayName,
    });
    const templateContent = buildDerivedPageTemplate({
      sourceId: input.sourceId,
      pdfPage: highlight.pdfPage,
      text: highlight.text,
      displayName: input.displayName,
    });
    const contentPreview = highlight.text.slice(0, 240);
    const derived = await input.derivePage({
      highlightId: highlight.id,
      body: { title, contentPreview, templateContent },
    });
    if (derived.alreadyDerived) {
      input.navigate(`/pages/${derived.pageId}`);
      return { status: "alreadyDerived", pageId: derived.pageId };
    }
    input.navigate(`/pages/${derived.pageId}`, {
      state: { initialContent: derived.templateContent ?? templateContent },
    });
    return { status: "ok", pageId: derived.pageId };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err : new Error(String(err)) };
  }
}

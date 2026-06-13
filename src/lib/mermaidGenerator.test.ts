import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MERMAID_DIAGRAM_TYPE_ORDER,
  getMermaidDiagramTypes,
  buildMermaidGeneratorUserPrompt,
  getAISettingsOrThrow,
  generateMermaidDiagram,
  type MermaidDiagramType,
} from "./mermaidGenerator";
import { loadAISettings } from "./aiSettings";
import { callAIService } from "@/lib/aiService";
import type { AISettings } from "@/types/ai";

// i18n: ラベル系キーはキー文字列をそのまま返し、生成プロンプトは決定的な文字列にする。
vi.mock("@/i18n", () => {
  const t = (key: string, opts?: { diagramTypes?: string }) => {
    if (key === "mermaid.generatorPrompt") {
      return `PROMPT[${opts?.diagramTypes ?? ""}]::__ZEDI_MERMAID_SOURCE__`;
    }
    return key;
  };
  return { default: { language: "en", getFixedT: () => t } };
});

vi.mock("./aiSettings", () => ({
  loadAISettings: vi.fn(),
}));

vi.mock("@/lib/aiService", () => ({
  callAIService: vi.fn(),
}));

const mockedLoad = vi.mocked(loadAISettings);
const mockedCall = vi.mocked(callAIService);

function settings(overrides: Partial<AISettings> = {}): AISettings {
  return {
    provider: "google",
    apiKey: "",
    apiMode: "api_server",
    model: "gemini-3-flash-preview",
    modelId: "google:gemini-3-flash-preview",
    isConfigured: false,
    ...overrides,
  };
}

describe("mermaidGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getMermaidDiagramTypes", () => {
    it("固定順で全ダイアグラムタイプを返す", () => {
      const types = getMermaidDiagramTypes();

      expect(types.map((d) => d.id)).toEqual([...MERMAID_DIAGRAM_TYPE_ORDER]);
    });

    it("各タイプの name/description/example を i18n キーから引く", () => {
      const flowchart = getMermaidDiagramTypes().find((d) => d.id === "flowchart");

      expect(flowchart).toEqual({
        id: "flowchart",
        name: "mermaid.diagramTypes.flowchart.name",
        description: "mermaid.diagramTypes.flowchart.description",
        example: "mermaid.diagramTypes.flowchart.example",
      });
    });
  });

  describe("buildMermaidGeneratorUserPrompt", () => {
    it("選択されたタイプを name/id/description の一覧としてプロンプトに含める", () => {
      const prompt = buildMermaidGeneratorUserPrompt(["flowchart", "pie"], "body");

      expect(prompt).toContain(
        "- mermaid.diagramTypes.flowchart.name (flowchart): mermaid.diagramTypes.flowchart.description",
      );
      expect(prompt).toContain(
        "- mermaid.diagramTypes.pie.name (pie): mermaid.diagramTypes.pie.description",
      );
    });

    it("未知のタイプは一覧から除外される", () => {
      const prompt = buildMermaidGeneratorUserPrompt(
        ["flowchart", "bogus" as MermaidDiagramType],
        "body",
      );

      expect(prompt).not.toContain("bogus");
    });

    it("sourceText はプレースホルダー置換で埋め込まれる（i18n 補間は通さない）", () => {
      const prompt = buildMermaidGeneratorUserPrompt(["flowchart"], "raw {{text}}");

      expect(prompt).toContain("::raw {{text}}");
      expect(prompt).not.toContain("__ZEDI_MERMAID_SOURCE__");
    });
  });

  describe("getAISettingsOrThrow", () => {
    it("設定が無い場合は api_server デフォルトを isConfigured:true で返す", async () => {
      mockedLoad.mockResolvedValue(null);

      const result = await getAISettingsOrThrow();

      expect(result.isConfigured).toBe(true);
      expect(result.apiMode).toBe("api_server");
    });

    it("api_server モードなら apiKey が無くても isConfigured:true を返す", async () => {
      mockedLoad.mockResolvedValue(settings({ apiMode: "api_server", apiKey: "" }));

      const result = await getAISettingsOrThrow();

      expect(result.isConfigured).toBe(true);
    });

    it("claude-code プロバイダーは apiKey 不要で返す", async () => {
      mockedLoad.mockResolvedValue(
        settings({ provider: "claude-code", apiMode: "user_api_key", apiKey: "" }),
      );

      const result = await getAISettingsOrThrow();

      expect(result.isConfigured).toBe(true);
    });

    it("user_api_key モードで apiKey が無い場合は AI_NOT_CONFIGURED を throw する", async () => {
      mockedLoad.mockResolvedValue(
        settings({ provider: "openai", apiMode: "user_api_key", apiKey: "", isConfigured: false }),
      );

      await expect(getAISettingsOrThrow()).rejects.toThrow("AI_NOT_CONFIGURED");
    });

    it("user_api_key モードで apiKey がある場合はそのまま返す", async () => {
      const s = settings({
        provider: "openai",
        apiMode: "user_api_key",
        apiKey: "sk-test",
        isConfigured: true,
      });
      mockedLoad.mockResolvedValue(s);

      expect(await getAISettingsOrThrow()).toEqual(s);
    });
  });

  describe("generateMermaidDiagram (api_server 経路)", () => {
    beforeEach(() => {
      mockedLoad.mockResolvedValue(settings({ apiMode: "api_server" }));
    });

    /** callAIService が指定コードで onComplete を呼ぶようにする。 */
    function respondWith(code: string) {
      mockedCall.mockImplementation(async (_settings, _req, handlers) => {
        handlers.onComplete?.({ content: code } as never);
      });
    }

    const detectionCases: Array<[string, MermaidDiagramType]> = [
      ["flowchart TD\nA-->B", "flowchart"],
      ["graph LR\nA-->B", "flowchart"],
      ["sequenceDiagram\nA->>B: hi", "sequence"],
      ["classDiagram\nClass01", "classDiagram"],
      ["stateDiagram-v2\n[*]-->S", "stateDiagram"],
      ["erDiagram\nCUSTOMER", "erDiagram"],
      ["gantt\ntitle X", "gantt"],
      ["pie\ntitle Pets", "pie"],
      ["mindmap\nroot", "mindmap"],
    ];

    for (const [code, expected] of detectionCases) {
      it(`生成コード "${code.split("\n")[0]}" から ${expected} を検出する`, async () => {
        respondWith(code);
        const onComplete = vi.fn();
        const onError = vi.fn();

        await generateMermaidDiagram("text", ["pie"], { onComplete, onError });

        expect(onComplete).toHaveBeenCalledWith({
          code: code.trim(),
          diagramType: expected,
        });
        expect(onError).not.toHaveBeenCalled();
      });
    }

    it("既知のプレフィックスが無い場合は最初にリクエストされたタイプにフォールバックする", async () => {
      respondWith("something unrecognized");
      const onComplete = vi.fn();

      await generateMermaidDiagram("text", ["erDiagram", "pie"], {
        onComplete,
        onError: vi.fn(),
      });

      expect(onComplete).toHaveBeenCalledWith({
        code: "something unrecognized",
        diagramType: "erDiagram",
      });
    });

    it("リクエストタイプが空の場合のフォールバックは flowchart", async () => {
      respondWith("unrecognized");
      const onComplete = vi.fn();

      await generateMermaidDiagram("text", [], { onComplete, onError: vi.fn() });

      expect(onComplete).toHaveBeenCalledWith({
        code: "unrecognized",
        diagramType: "flowchart",
      });
    });

    it("callAIService の onError はそのまま伝播する", async () => {
      const err = new Error("service down");
      mockedCall.mockImplementation(async (_settings, _req, handlers) => {
        handlers.onError?.(err);
      });
      const onError = vi.fn();

      await generateMermaidDiagram("text", ["pie"], { onComplete: vi.fn(), onError });

      expect(onError).toHaveBeenCalledWith(err);
    });

    it("callAIService が throw した場合は onError でラップして通知する", async () => {
      mockedCall.mockRejectedValue(new Error("boom"));
      const onError = vi.fn();

      await generateMermaidDiagram("text", ["pie"], { onComplete: vi.fn(), onError });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    });
  });
});

/**
 * Built-in workflow templates (Issue #462).
 * 組み込みワークフローテンプレート（Issue #462）。
 */

import type { WorkflowDefinition, WorkflowStepDefinition } from "./types";
import { newWorkflowId } from "./newWorkflowId";

/**
 * Known template ids for selection UI.
 * 選択 UI 用のテンプレート ID。
 */
export const WORKFLOW_TEMPLATE_IDS = [
  "code-investigate-design",
  "test-analyze-improve",
  "repo-analyze-docs",
  "web-research-note",
] as const;

/** Template id union. / テンプレート ID ユニオン */
export type WorkflowTemplateId = (typeof WORKFLOW_TEMPLATE_IDS)[number];

/**
 * i18n key for the template title (see `aiChat.workflow.templates.*`).
 * テンプレートタイトル用 i18n キー（`aiChat.workflow.templates.*`）。
 */
export const WORKFLOW_TEMPLATE_NAME_KEYS: Record<WorkflowTemplateId, string> = {
  "code-investigate-design": "aiChat.workflow.templates.codeInvestigateDesign",
  "test-analyze-improve": "aiChat.workflow.templates.testAnalyzeImprove",
  "repo-analyze-docs": "aiChat.workflow.templates.repoAnalyzeDocs",
  "web-research-note": "aiChat.workflow.templates.webResearchNote",
};

type StepSeed = Omit<WorkflowStepDefinition, "id">;

function stepsForTemplate(id: WorkflowTemplateId): StepSeed[] {
  switch (id) {
    case "code-investigate-design":
      return [
        {
          title: "Investigate code patterns",
          instruction:
            "Explore the linked workspace: identify API or routing patterns, naming conventions, and error-handling style. Summarize findings as bullet points.",
          maxTurns: 20,
          allowedTools: ["Read"],
        },
        {
          title: "Draft design memo",
          instruction:
            "Based on the investigation, propose a design for the feature described in the note context. Output structured Markdown (goal, options, recommendation, risks).",
          maxTurns: 16,
          allowedTools: ["Read"],
        },
      ];
    case "test-analyze-improve":
      return [
        {
          title: "Run tests",
          instruction:
            "Run the project's test command in the linked workspace (e.g. `bun run test:run` or the standard command you detect). Capture failing vs passing summary.",
          maxTurns: 12,
          allowedTools: ["Bash", "Read"],
        },
        {
          title: "Analyze results",
          instruction:
            "Analyze the test output: categorize failures, likely root causes, and flaky vs deterministic issues.",
          maxTurns: 14,
          allowedTools: ["Read"],
        },
        {
          title: "Suggest improvements",
          instruction:
            "Propose concrete next steps: code changes, test fixes, and follow-up commands. Use Markdown with numbered actions.",
          maxTurns: 14,
          allowedTools: ["Read"],
        },
      ];
    case "repo-analyze-docs":
      return [
        {
          title: "Repository analysis",
          instruction:
            "Scan the repository structure (top-level dirs, packages, build entrypoints). Summarize architecture and main technologies.",
          maxTurns: 20,
          allowedTools: ["Read", "Bash"],
        },
        {
          title: "Generate documentation draft",
          instruction:
            "Produce a documentation outline: overview, setup, development, testing, deployment. Fill with what you can infer from the repo.",
          maxTurns: 18,
          allowedTools: ["Read"],
        },
      ];
    case "web-research-note":
      return [
        {
          title: "Web research",
          instruction:
            "Research the topic implied by the note title/context using web search. Collect key facts, sources, and conflicting viewpoints.",
          maxTurns: 20,
          allowedTools: ["WebSearch", "Read"],
        },
        {
          title: "Organize information",
          instruction:
            "Structure the findings: summary table or bullets, source list, and open questions.",
          maxTurns: 12,
          allowedTools: [],
        },
        {
          title: "Draft note content",
          instruction:
            "Write polished Markdown suitable for the note: clear headings, links to sources, and a short conclusion.",
          maxTurns: 16,
          allowedTools: [],
        },
      ];
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown template: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Creates a new {@link WorkflowDefinition} from a built-in template.
 * 組み込みテンプレートから新しい {@link WorkflowDefinition} を作る。
 */
export function instantiateWorkflowTemplate(
  id: WorkflowTemplateId,
  displayName: string,
): WorkflowDefinition {
  const now = Date.now();
  const seeds = stepsForTemplate(id);
  const steps: WorkflowStepDefinition[] = seeds.map((s) => ({
    ...s,
    id: newWorkflowId(),
  }));
  return {
    id: newWorkflowId(),
    name: displayName,
    steps,
    createdAt: now,
    updatedAt: now,
  };
}

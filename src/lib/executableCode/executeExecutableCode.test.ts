import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claudeCode/runQueryToCompletion", () => ({
  runClaudeQueryToCompletion: vi.fn(),
}));

import { runClaudeQueryToCompletion } from "@/lib/claudeCode/runQueryToCompletion";
import {
  interpretExecutableCodeOutput,
  runExecutableCodeInNotebook,
} from "./executeExecutableCode";

const MARKED = "---ZEDI_STDOUT---\nout\n---ZEDI_STDERR---\nerr\n---ZEDI_EXIT---\n1\n";

describe("executeExecutableCode", () => {
  beforeEach(() => {
    vi.mocked(runClaudeQueryToCompletion).mockReset();
  });

  it("runExecutableCodeInNotebook parses marked stdout/stderr/exit", async () => {
    vi.mocked(runClaudeQueryToCompletion).mockResolvedValue({ ok: true, content: MARKED });
    const r = await runExecutableCodeInNotebook("bash", "echo hi");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.stdout).toBe("out");
      expect(r.result.stderr).toBe("err");
      expect(r.result.exitCode).toBe(1);
    }
    expect(runClaudeQueryToCompletion).toHaveBeenCalledWith(
      expect.stringContaining("Zedi's notebook runner"),
      expect.objectContaining({ maxTurns: 12, allowedTools: ["Bash"] }),
      undefined,
    );
  });

  it("runExecutableCodeInNotebook forwards sidecar error", async () => {
    vi.mocked(runClaudeQueryToCompletion).mockResolvedValue({ ok: false, error: "offline" });
    const r = await runExecutableCodeInNotebook("bash", "x");
    expect(r).toEqual({ ok: false, error: "offline" });
  });

  it("interpretExecutableCodeOutput uses empty allowedTools", async () => {
    vi.mocked(runClaudeQueryToCompletion).mockResolvedValue({ ok: true, content: "summary" });
    const r = await interpretExecutableCodeOutput("a", "b", 0);
    expect(r).toEqual({ ok: true, text: "summary" });
    expect(runClaudeQueryToCompletion).toHaveBeenCalledWith(
      expect.stringContaining("helping inside Zedi"),
      expect.objectContaining({ maxTurns: 6, allowedTools: [] }),
      undefined,
    );
  });
});

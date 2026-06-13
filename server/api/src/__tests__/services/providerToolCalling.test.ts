/**
 * Tests for provider tool-calling request/response helpers.
 */
import { describe, expect, it } from "vitest";
import {
  buildGoogleToolRequest,
  buildOpenAiToolRequest,
  normalizeFunctionTools,
  parseGoogleToolCalls,
  parseOpenAiToolCalls,
} from "../../services/providerToolCalling.js";
import type { ZediChatTool } from "../../types/index.js";

const sampleTools: ZediChatTool[] = [
  {
    type: "function",
    function: {
      name: "structure_dialogue",
      description: "Propose an outline",
      parameters: {
        type: "object",
        properties: {
          sections: { type: "array" },
        },
      },
    },
  },
];

describe("normalizeFunctionTools", () => {
  it("keeps OpenAI-shaped function tools", () => {
    expect(normalizeFunctionTools(sampleTools)).toEqual([
      {
        name: "structure_dialogue",
        description: "Propose an outline",
        parameters: sampleTools[0]?.function.parameters,
      },
    ]);
  });
});

describe("parseOpenAiToolCalls", () => {
  it("parses JSON string arguments into objects", () => {
    const calls = parseOpenAiToolCalls({
      tool_calls: [
        {
          id: "call_1",
          function: {
            name: "structure_dialogue",
            arguments: JSON.stringify({ sections: [{ heading: "Intro" }] }),
          },
        },
      ],
    });
    expect(calls).toEqual([
      {
        id: "call_1",
        name: "structure_dialogue",
        args: { sections: [{ heading: "Intro" }] },
      },
    ]);
  });
});

describe("parseGoogleToolCalls", () => {
  it("maps Gemini functionCall parts", () => {
    const calls = parseGoogleToolCalls([
      {
        functionCall: {
          name: "structure_dialogue",
          args: { sections: [{ heading: "Intro", intent: "x", depth: 1 }] },
        },
      },
    ]);
    expect(calls[0]?.name).toBe("structure_dialogue");
    expect(calls[0]?.args).toEqual({
      sections: [{ heading: "Intro", intent: "x", depth: 1 }],
    });
  });
});

describe("buildOpenAiToolRequest", () => {
  it("includes tools payload when declarations exist", () => {
    const payload = buildOpenAiToolRequest(normalizeFunctionTools(sampleTools));
    expect(payload.tools).toHaveLength(1);
  });
});

describe("buildGoogleToolRequest", () => {
  it("forces a named function when tool choice is set", () => {
    const payload = buildGoogleToolRequest(normalizeFunctionTools(sampleTools), {
      type: "function",
      function: { name: "structure_dialogue" },
    });
    expect(payload.toolConfig).toEqual({
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: ["structure_dialogue"],
      },
    });
  });

  it("keeps googleSearch when function tools and useGoogleSearch are both set", () => {
    const payload = buildGoogleToolRequest(normalizeFunctionTools(sampleTools), undefined, {
      useGoogleSearch: true,
    });
    expect(payload.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: "structure_dialogue",
            description: "Propose an outline",
            parameters: sampleTools[0]?.function.parameters,
          },
        ],
      },
      { googleSearch: {} },
    ]);
    expect(payload.toolConfig).toEqual({
      includeServerSideToolInvocations: true,
    });
  });
});

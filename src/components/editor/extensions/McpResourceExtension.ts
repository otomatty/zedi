/**
 * MCP リソース埋め込みノード拡張（Issue #463）。
 * MCP resource embed node extension (Issue #463).
 *
 * ノート内に MCP リソース参照を埋め込むためのブロックノード。
 * `@mcp:サーバー名/リソース` 記法またはスラッシュコマンドで挿入する。
 * Block node for embedding MCP resource references in notes.
 * Inserted via `@mcp:server/resource` notation or slash command.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { McpResourceNodeView } from "../McpResourceNodeView";

/**
 * MCP リソースノードのオプション。
 * Options for the MCP resource node.
 */
export interface McpResourceOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mcpResource: {
      /**
       * MCP リソースブロックを挿入する。
       * Insert an MCP resource block.
       */
      insertMcpResource: (attrs: {
        server: string;
        resource: string;
        params?: string;
      }) => ReturnType;
      /**
       * MCP リソースの解決済みコンテンツを更新する。
       * Update the resolved content of an MCP resource.
       */
      updateMcpResourceContent: (content: string) => ReturnType;
    };
  }
}

export /**
 *
 */
const McpResource = Node.create<McpResourceOptions>({
  name: "mcpResource",

  group: "block",

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      server: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-mcp-server") || "",
        renderHTML: (attributes) => ({ "data-mcp-server": attributes.server }),
      },
      resource: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-mcp-resource") || "",
        renderHTML: (attributes) => ({ "data-mcp-resource": attributes.resource }),
      },
      params: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-mcp-params") || "",
        renderHTML: (attributes) => ({ "data-mcp-params": attributes.params }),
      },
      resolvedContent: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-mcp-content") || "",
        renderHTML: (attributes) => ({ "data-mcp-content": attributes.resolvedContent }),
      },
      status: {
        default: "pending",
        parseHTML: (element) => element.getAttribute("data-mcp-status") || "pending",
        renderHTML: (attributes) => ({ "data-mcp-status": attributes.status }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mcp-resource"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "mcp-resource",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(McpResourceNodeView);
  },

  addCommands() {
    return {
      insertMcpResource:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              server: attrs.server,
              resource: attrs.resource,
              params: attrs.params ?? "",
              status: "pending",
            },
          });
        },
      updateMcpResourceContent:
        (content: string) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, {
            resolvedContent: content,
            status: "resolved",
          });
        },
    };
  },
});

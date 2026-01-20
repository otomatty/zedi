import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ImageUploadNodeView } from "../ImageUploadNodeView.tsx";

export interface ImageUploadOptions {
  HTMLAttributes: Record<string, unknown>;
  onRetry?: (uploadId: string) => void;
  onRemove?: (uploadId: string) => void;
  getProviderLabel?: (providerId?: string | null) => string | null;
}

export interface ImageUploadAttributes {
  uploadId: string;
  status?: "uploading" | "error";
  progress?: number;
  previewUrl?: string | null;
  fileName?: string | null;
  errorMessage?: string | null;
  providerId?: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageUpload: {
      insertImageUpload: (attributes: ImageUploadAttributes) => ReturnType;
    };
  }
}

export const ImageUpload = Node.create<ImageUploadOptions>({
  name: "imageUpload",

  group: "block",

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      onRetry: undefined,
      onRemove: undefined,
      getProviderLabel: undefined,
    };
  },

  addAttributes() {
    return {
      uploadId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-upload-id"),
        renderHTML: (attributes) =>
          attributes.uploadId ? { "data-upload-id": attributes.uploadId } : {},
      },
      status: {
        default: "uploading",
        parseHTML: (element) =>
          element.getAttribute("data-status") || "uploading",
        renderHTML: (attributes) =>
          attributes.status ? { "data-status": attributes.status } : {},
      },
      progress: {
        default: 0,
        parseHTML: (element) => {
          const value = element.getAttribute("data-progress");
          return value ? Number(value) : 0;
        },
        renderHTML: (attributes) =>
          typeof attributes.progress === "number"
            ? { "data-progress": attributes.progress }
            : {},
      },
      previewUrl: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-preview-url"),
        renderHTML: (attributes) =>
          attributes.previewUrl
            ? { "data-preview-url": attributes.previewUrl }
            : {},
      },
      fileName: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-file-name"),
        renderHTML: (attributes) =>
          attributes.fileName ? { "data-file-name": attributes.fileName } : {},
      },
      errorMessage: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-error-message"),
        renderHTML: (attributes) =>
          attributes.errorMessage
            ? { "data-error-message": attributes.errorMessage }
            : {},
      },
      providerId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-provider-id"),
        renderHTML: (attributes) =>
          attributes.providerId
            ? { "data-provider-id": attributes.providerId }
            : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="image-upload"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "image-upload",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageUploadNodeView);
  },

  addCommands() {
    return {
      insertImageUpload:
        (attributes: ImageUploadAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },
});

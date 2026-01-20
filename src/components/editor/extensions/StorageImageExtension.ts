import Image, { type ImageOptions } from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { InputRule } from "@tiptap/core";
import { ImageNodeView } from "../ImageNodeView.tsx";

export interface StorageImageOptions extends ImageOptions {
  getProviderLabel?: (providerId?: string | null) => string | null;
  canDeleteFromStorage?: (providerId?: string | null) => boolean;
  onDeleteFromStorage?: (url: string, providerId?: string | null) => Promise<void>;
  onCopyUrl?: (url: string) => void;
  onOpenUrl?: (url: string) => void;
}

export const StorageImage = Image.extend<StorageImageOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {},
      getProviderLabel: undefined,
      canDeleteFromStorage: undefined,
      onDeleteFromStorage: undefined,
      onCopyUrl: undefined,
      onOpenUrl: undefined,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      storageProviderId: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-storage-provider") || null,
        renderHTML: (attributes) =>
          attributes.storageProviderId
            ? { "data-storage-provider": attributes.storageProviderId }
            : {},
      },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?[^\s]*)?)$/i,
        handler: ({ state, range, match }) => {
          const imageUrl = match[1];
          const { tr } = state;
          tr.replaceWith(
            range.from,
            range.to,
            this.type.create({
              src: imageUrl,
              alt: imageUrl.split("/").pop() || "image",
              title: imageUrl,
            })
          );
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

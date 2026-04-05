import Image, { type ImageOptions } from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { InputRule } from "@tiptap/core";
import { ImageNodeView } from "../ImageNodeView.tsx";
import { gyazoToImageUrl } from "../utils/urlTransform";

/**
 * 認証済み画像 URL を表示可能な URL（blob URL 等）に変換する関数の型。
 * Function type that converts auth-required URLs (e.g. /api/media/:id) to displayable URLs (e.g. blob URLs).
 */
export type GetAuthenticatedImageUrl = (url: string) => Promise<string | null>;

/**
 * StorageImage 拡張のオプション。ImageOptions を継承し、ストレージプロバイダ関連のコールバックを追加する。
 * Options for the StorageImage extension. Extends ImageOptions with storage-provider-related callbacks.
 */
export interface StorageImageOptions extends ImageOptions {
  getProviderLabel?: (providerId?: string | null) => string | null;
  canDeleteFromStorage?: (providerId?: string | null) => boolean;
  onDeleteFromStorage?: (url: string, providerId?: string | null) => Promise<void>;
  onCopyUrl?: (url: string) => void;
  onOpenUrl?: (url: string) => void;
  /** 認証が必要な URL を表示可能な blob URL に変換する / Convert auth-required URLs to displayable blob URLs */
  getAuthenticatedImageUrl?: GetAuthenticatedImageUrl;
}

/**
 * Tiptap の Image 拡張を継承し、ストレージプロバイダ連携・Gyazo パーマリンク変換を追加した画像ノード。
 * Image node extending Tiptap's Image extension with storage-provider integration and Gyazo permalink input rules.
 */
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
      getAuthenticatedImageUrl: undefined,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      storageProviderId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-storage-provider") || null,
        renderHTML: (attributes) =>
          attributes.storageProviderId
            ? { "data-storage-provider": attributes.storageProviderId }
            : {},
      },
    };
  },

  addInputRules() {
    return [
      // 通常の画像 URL / Standard image URLs
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
            }),
          );
        },
      }),
      // Gyazo パーマリンク / Gyazo permalink → image
      new InputRule({
        find: /(https?:\/\/gyazo\.com\/[a-f0-9]{32})$/i,
        handler: ({ state, range, match }) => {
          const originalUrl = match[1];
          const imageUrl = gyazoToImageUrl(originalUrl);
          if (!imageUrl) return;
          const { tr } = state;
          tr.replaceWith(
            range.from,
            range.to,
            this.type.create({
              src: imageUrl,
              alt: "Gyazo image",
              title: originalUrl,
            }),
          );
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

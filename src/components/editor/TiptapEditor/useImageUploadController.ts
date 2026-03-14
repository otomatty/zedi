import type { MutableRefObject } from "react";
import type { Editor } from "@tiptap/core";
import { useImageUploadManager } from "./useImageUploadManager";
import { useTiptapEditorStorageFeatures } from "./useTiptapEditorStorage";
import type { TiptapEditorProps } from "./types";

/**
 * 画像アップロード用の設定を useImageUploadManager に渡すラッパー。
 * useTiptapEditorController の行数削減のため切り出し。
 *
 * Wrapper that passes image upload config to useImageUploadManager.
 * Extracted from useTiptapEditorController to reduce file length.
 */
export function useImageUploadController(args: {
  editorRef: MutableRefObject<Editor | null>;
  onChange: TiptapEditorProps["onChange"];
  isReadOnly: boolean;
  isStorageConfigured: boolean;
  isStorageLoading: boolean;
  storageSettings: ReturnType<typeof useTiptapEditorStorageFeatures>["storageSettings"];
  toast: ReturnType<typeof useTiptapEditorStorageFeatures>["toast"];
  openStorageSetupDialog: () => void;
  lastSelectionRef: MutableRefObject<{ from: number; to: number } | null>;
}) {
  return useImageUploadManager({
    editorRef: args.editorRef,
    onChange: args.onChange,
    isReadOnly: args.isReadOnly,
    isStorageConfigured: args.isStorageConfigured,
    isStorageLoading: args.isStorageLoading,
    storageSettings: args.storageSettings,
    toast: args.toast,
    onRequestStorageSetup: args.openStorageSetupDialog,
    lastSelectionRef: args.lastSelectionRef,
  });
}

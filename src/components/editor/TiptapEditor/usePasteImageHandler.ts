import { useEffect } from "react";
import type { Editor } from "@tiptap/core";

interface UsePasteImageHandlerParams {
  editor: Editor | null;
  handleImageUpload: (files: FileList | File[]) => void;
}

export function usePasteImageHandler({
  editor,
  handleImageUpload,
}: UsePasteImageHandlerParams) {
  useEffect(() => {
    if (!editor) return;

    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      const text = event.clipboardData?.getData("text/plain");

      if (items) {
        const imageItems = Array.from(items).filter((item) =>
          item.type.startsWith("image/")
        );

        if (imageItems.length > 0) {
          event.preventDefault();
          const files = imageItems
            .map((item) => item.getAsFile())
            .filter((file): file is File => file !== null);
          handleImageUpload(files);
          return;
        }
      }

      if (text) {
        const imageUrlPattern =
          /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?[^\s]*)?/i;
        const matches = text.match(imageUrlPattern);

        if (matches && matches[0]) {
          event.preventDefault();
          const imageUrl = matches[0];

          try {
            const response = await fetch(imageUrl, { method: "HEAD" });
            const contentType = response.headers.get("content-type");

            if (contentType && contentType.startsWith("image/")) {
              editor
                .chain()
                .focus()
                .setImage({
                  src: imageUrl,
                  alt: imageUrl.split("/").pop() || "image",
                  title: imageUrl,
                })
                .run();
              return;
            }
          } catch {
            // CORS等でHEADが失敗する場合でも挿入を試みる
          }

          editor
            .chain()
            .focus()
            .setImage({
              src: imageUrl,
              alt: imageUrl.split("/").pop() || "image",
              title: imageUrl,
            })
            .run();
        }
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener("paste", handlePaste);

    return () => {
      editorElement.removeEventListener("paste", handlePaste);
    };
  }, [editor, handleImageUpload]);
}

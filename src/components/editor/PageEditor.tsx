// PageEditor component using Tiptap with Internal Link support
import { createSignal, Show } from "solid-js";
import { createTiptapEditor } from "solid-tiptap";
import StarterKit from "@tiptap/starter-kit";
import { InternalLink } from "./extensions/InternalLink";

export interface PageEditorProps {
  initialContent?: string;
  placeholder?: string;
  onContentChange?: (content: string) => void;
  onTitleChange?: (title: string) => void;
  onSave?: (title: string, content: string) => void;
  onLinkClick?: (title: string, exists: boolean) => void;
  existingPageTitles?: string[];
  autoFocus?: boolean;
  readOnly?: boolean;
}

export function PageEditor(props: PageEditorProps) {
  let editorContainerRef: HTMLDivElement | undefined;
  const [title, setTitle] = createSignal("");
  const [isFocused, setIsFocused] = createSignal(false);
  const [charCount, setCharCount] = createSignal(0);
  const [linkCount, setLinkCount] = createSignal(0);

  // Count internal links in the editor
  const processInternalLinks = (editor: any) => {
    let count = 0;

    // Count existing links
    const doc = editor.state.doc;
    doc.descendants((node: any) => {
      if (node.marks) {
        node.marks.forEach((mark: any) => {
          if (mark.type.name === "internalLink") {
            count++;
          }
        });
      }
    });

    setLinkCount(count);
  };

  const handleLinkClick = (title: string, exists: boolean) => {
    if (props.onLinkClick) {
      props.onLinkClick(title, exists);
    }
  };

  const editor = createTiptapEditor(() => ({
    element: editorContainerRef!,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      InternalLink.configure({
        onLinkClick: handleLinkClick,
        existingTitles: props.existingPageTitles || [],
      }),
    ],
    content: props.initialContent || "",
    editable: !props.readOnly,
    autofocus: props.autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: "page-editor-content prose prose-sm sm:prose dark:prose-invert focus:outline-none min-h-[100px] max-w-none",
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      setCharCount(text.length);
      processInternalLinks(editor);
      
      if (props.onContentChange) {
        props.onContentChange(editor.getHTML());
      }
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  }));

  // Insert internal link at cursor position (for future use with LinkSuggestionMenu)
  const _insertInternalLink = (linkTitle: string, exists: boolean = false) => {
    const e = editor();
    if (e) {
      e.chain()
        .focus()
        .insertContent({
          type: "text",
          text: linkTitle,
          marks: [
            {
              type: "internalLink",
              attrs: { title: linkTitle, exists },
            },
          ],
        })
        .run();
    }
  };

  // Character limit indicator (soft limit as per PRD: 500-1000 chars)
  const getCharLimitColor = () => {
    const count = charCount();
    if (count < 500) return "text-success-500";
    if (count < 800) return "text-warning-500";
    if (count < 1000) return "text-warning-600";
    return "text-error-500";
  };

  const handleTitleChange = (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setTitle(value);
    if (props.onTitleChange) {
      props.onTitleChange(value);
    }
  };

  const handleSave = () => {
    const e = editor();
    if (e && props.onSave) {
      props.onSave(title(), e.getHTML());
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Cmd/Ctrl + S to save
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div 
      class={`zedi-card p-6 transition-all duration-200 ${
        isFocused() ? "ring-2 ring-primary-400/50" : ""
      }`}
      onKeyDown={handleKeyDown}
    >
      {/* Title Input */}
      <input
        type="text"
        value={title()}
        onInput={handleTitleChange}
        placeholder="タイトル"
        class="w-full text-xl font-semibold bg-transparent border-none outline-none text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] mb-4"
        autofocus={props.autoFocus}
      />

      {/* Divider */}
      <div class="h-px bg-[var(--border-subtle)] mb-4" />

      {/* Editor Container */}
      <div 
        ref={editorContainerRef}
        class="page-editor-wrapper"
      />

      {/* Link hint */}
      <Show when={isFocused()}>
        <div class="mt-3 text-xs text-[var(--text-tertiary)]">
          💡 <code class="px-1 py-0.5 bg-[var(--bg-base)] rounded">[[キーワード]]</code> でリンクを作成
        </div>
      </Show>

      {/* Footer with character count and actions */}
      <div class="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border-subtle)]">
        <div class="flex items-center gap-4">
          <span class={`text-xs ${getCharLimitColor()}`}>
            {charCount()} 文字
          </span>
          <Show when={linkCount() > 0}>
            <span class="text-xs text-primary-500">
              🔗 {linkCount()} リンク
            </span>
          </Show>
          <Show when={charCount() > 800}>
            <span class="text-xs text-[var(--text-tertiary)]">
              • ページを分割することを検討してください
            </span>
          </Show>
        </div>
        
        <Show when={!props.readOnly}>
          <button
            onClick={handleSave}
            class="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
          >
            保存
          </button>
        </Show>
      </div>
    </div>
  );
}

// Backwards compatibility aliases
export const CardEditor = PageEditor;
export type CardEditorProps = PageEditorProps;

export default PageEditor;

// PageEditorModal - Modal for creating/editing pages
import { createSignal } from "solid-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogCloseButton,
} from "../ui/Dialog";
import { Button } from "../ui/Button";
import { PageEditor } from "../editor";
import type { Page } from "../../types/page";

export interface PageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, content: string) => void;
  page?: Page; // If provided, we're editing an existing page
  isSaving?: boolean;
}

export function PageEditorModal(props: PageEditorModalProps) {
  const [title, setTitle] = createSignal(props.page?.title || "");
  const [content, setContent] = createSignal(props.page?.content || "");

  const handleSave = () => {
    props.onSave(title(), content());
  };

  const isEditing = () => !!props.page;

  return (
    <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent class="max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEditing() ? "ページを編集" : "新規ページ"}
          </DialogTitle>
          <DialogCloseButton />
        </DialogHeader>
        
        <DialogBody class="flex-1 overflow-y-auto p-0">
          <div class="p-6">
            <PageEditor
              initialContent={props.page?.content}
              autoFocus={true}
              onTitleChange={setTitle}
              onContentChange={setContent}
              onSave={handleSave}
            />
          </div>
        </DialogBody>

        <DialogFooter class="border-t border-[var(--border-subtle)]">
          <Button 
            variant="ghost" 
            color="default" 
            onClick={props.onClose}
            disabled={props.isSaving}
          >
            キャンセル
          </Button>
          <Button 
            variant="solid" 
            color="primary" 
            onClick={handleSave}
            disabled={props.isSaving || (!title() && !content())}
          >
            {props.isSaving ? "保存中..." : "保存する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Backwards compatibility aliases
export const CardEditorModal = PageEditorModal;
export type CardEditorModalProps = PageEditorModalProps;

export default PageEditorModal;

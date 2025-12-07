// CardEditorModal - Modal for creating/editing cards
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
import { CardEditor } from "../editor";
import type { Card } from "../../types/card";

export interface CardEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, content: string) => void;
  card?: Card; // If provided, we're editing an existing card
  isSaving?: boolean;
}

export function CardEditorModal(props: CardEditorModalProps) {
  const [title, setTitle] = createSignal(props.card?.title || "");
  const [content, setContent] = createSignal(props.card?.content || "");

  const handleSave = () => {
    props.onSave(title(), content());
  };

  const isEditing = () => !!props.card;

  return (
    <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent class="max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEditing() ? "カードを編集" : "新規カード"}
          </DialogTitle>
          <DialogCloseButton />
        </DialogHeader>
        
        <DialogBody class="flex-1 overflow-y-auto p-0">
          <div class="p-6">
            <CardEditor
              initialContent={props.card?.content}
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

export default CardEditorModal;

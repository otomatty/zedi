/**
 * `OutlineEditor` — editable outline list for the Structure phase (#950).
 *
 * Orchestrator が提案したアウトラインをユーザーが編集 (並び替え / リネーム /
 * depth 変更 / 削除) するための軽量 UI。ドラッグ&ドロップは将来対応とし、
 * 当面は上下矢印ボタンで順序入れ替えする。
 *
 * Minimal accessible outline editor. Each section row has heading + intent
 * inputs, depth toggle (h2 ↔ h3), move-up / move-down buttons, and a delete
 * button. The user submits via the dedicated button at the bottom.
 */
import React, { useState } from "react";
import { ArrowDown, ArrowUp, Trash2, Plus, Check } from "lucide-react";
import { Button, Card, CardContent, Input, Textarea } from "@zedi/ui";
import { cn } from "@zedi/ui";
import type { OutlineSection } from "@/lib/wikiCompose/types";

let nextLocalId = 0;
function makeLocalId(): string {
  nextLocalId += 1;
  return `local-${nextLocalId}-${Date.now()}`;
}

export interface OutlineEditorProps {
  initialSections: OutlineSection[];
  disabled?: boolean;
  onSubmit: (sections: OutlineSection[]) => Promise<void>;
}

/** Render an editable outline. */
export const OutlineEditor: React.FC<OutlineEditorProps> = ({
  initialSections,
  disabled = false,
  onSubmit,
}) => {
  const [sections, setSections] = useState<OutlineSection[]>(initialSections);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    setSections(initialSections);
  }, [initialSections]);

  const move = (index: number, direction: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const item = next[index];
      const other = next[target];
      if (!item || !other) return prev;
      next[index] = other;
      next[target] = item;
      return next;
    });
  };

  const remove = (id: string) => setSections((prev) => prev.filter((s) => s.id !== id));

  const add = () =>
    setSections((prev) => [
      ...prev,
      { id: makeLocalId(), heading: "New section", depth: 1, intent: "" },
    ]);

  const update = (id: string, patch: Partial<OutlineSection>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const isSubmittable = sections.length > 0 && sections.every((s) => s.heading.trim().length > 0);

  return (
    <div className="space-y-2">
      {sections.map((section, i) => (
        <Card
          key={section.id}
          data-testid={`outline-row-${section.id}`}
          className={cn("transition-colors", section.depth > 1 && "ml-6")}
        >
          <CardContent className="space-y-2 pt-4">
            <div className="flex items-center gap-2">
              <Input
                value={section.heading}
                data-testid={`outline-heading-${section.id}`}
                onChange={(e) => update(section.id, { heading: e.target.value })}
                placeholder="Section heading"
                disabled={disabled}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Toggle depth"
                onClick={() => update(section.id, { depth: section.depth === 1 ? 2 : 1 })}
                disabled={disabled}
              >
                H{section.depth + 1}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Move up"
                onClick={() => move(i, -1)}
                disabled={disabled || i === 0}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Move down"
                onClick={() => move(i, +1)}
                disabled={disabled || i === sections.length - 1}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Remove section"
                onClick={() => remove(section.id)}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              value={section.intent}
              data-testid={`outline-intent-${section.id}`}
              onChange={(e) => update(section.id, { intent: e.target.value })}
              placeholder="What should this section cover?"
              rows={2}
              disabled={disabled}
              className="text-xs"
            />
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={add}
          disabled={disabled}
          data-testid="outline-add"
        >
          <Plus className="mr-1 h-4 w-4" /> Add section
        </Button>
        <Button
          type="button"
          data-testid="outline-submit"
          disabled={disabled || submitting || !isSubmittable}
          onClick={async () => {
            setSubmitting(true);
            try {
              await onSubmit(sections);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Check className="mr-1 h-4 w-4" /> Approve outline
        </Button>
      </div>
    </div>
  );
};

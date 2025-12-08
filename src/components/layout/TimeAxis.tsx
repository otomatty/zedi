// TimeAxis component - the main view for displaying cards chronologically
import { For, Show } from "solid-js";
import { Card, CardHeader, CardContent, CardTitle } from "../ui/Card";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import type { Card as CardData } from "../../types/card";

export interface TimeAxisProps {
  cards: CardData[];
  isLoading?: boolean;
  onCardClick?: (card: CardData) => void;
  onNewCard?: () => void;
}

// Helper function to format relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp * 1000; // Convert Unix timestamp to ms
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  if (hours < 24) return `${hours}時間前`;
  if (days < 7) return `${days}日前`;
  
  // Format as date for older items
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

// Group cards by date
function groupCardsByDate(cards: CardData[]): Map<string, CardData[]> {
  const groups = new Map<string, CardData[]>();
  
  cards.forEach(card => {
    const date = new Date(card.created_at * 1000);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let key: string;
    if (date.toDateString() === today.toDateString()) {
      key = "今日";
    } else if (date.toDateString() === yesterday.toDateString()) {
      key = "昨日";
    } else {
      key = date.toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
    }
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(card);
  });
  
  return groups;
}

export function TimeAxis(props: TimeAxisProps) {
  const groupedCards = () => groupCardsByDate(props.cards);

  return (
    <div class="time-axis">
      {/* Header */}
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-1">
            Time Axis
          </h2>
          <p class="text-[var(--text-secondary)]">
            思考の流れを時系列で表示
          </p>
        </div>
        <Button variant="solid" color="primary" size="sm" onClick={props.onNewCard}>
          + 新規ページ
        </Button>
      </div>

      {/* Loading State */}
      <Show when={props.isLoading}>
        <div class="flex items-center justify-center py-12">
          <Spinner size="lg" color="primary" />
        </div>
      </Show>

      {/* Empty State */}
      <Show when={!props.isLoading && props.cards.length === 0}>
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center mb-4">
            <span class="text-3xl">📝</span>
          </div>
          <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-2">
            まだページがありません
          </h3>
          <p class="text-[var(--text-secondary)] mb-6 max-w-sm">
            思いついたことを書き留めて、知識のネットワークを作り始めましょう。
          </p>
          <Button variant="solid" color="primary" onClick={props.onNewCard}>
            最初のページを作成
          </Button>
        </div>
      </Show>

      {/* Cards by Date Group */}
      <Show when={!props.isLoading && props.cards.length > 0}>
        <div class="space-y-8">
          <For each={Array.from(groupedCards().entries())}>
            {([dateLabel, cards]) => (
              <div>
                {/* Date Label */}
                <div class="flex items-center gap-3 mb-4">
                  <span class="text-sm font-medium text-[var(--text-tertiary)]">
                    {dateLabel}
                  </span>
                  <div class="flex-1 h-px bg-[var(--border-subtle)]" />
                </div>

                {/* Cards Grid */}
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  <For each={cards}>
                    {(card) => (
                      <Card 
                        isPressable 
                        isHoverable 
                        class="animate-[slide-up_0.3s_ease-out]"
                        onClick={() => props.onCardClick?.(card)}
                      >
                        <CardHeader>
                          <div class="flex items-center justify-between">
                            <CardTitle class="text-sm truncate">{card.title || "無題のページ"}</CardTitle>
                            <span class="text-xs text-[var(--text-tertiary)]">
                              {formatRelativeTime(card.created_at)}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p class="text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                            {/* Strip HTML tags for preview */}
                            {card.content.replace(/<[^>]*>/g, "").substring(0, 200)}
                            {card.content.length > 200 ? "..." : ""}
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default TimeAxis;

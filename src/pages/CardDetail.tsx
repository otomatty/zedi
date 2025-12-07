// CardDetail page - Full card view with backlinks
import { Show, For, createSignal, onMount, createEffect } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { cardStore } from "../stores/cardStore";
import type { Card as CardData, Link } from "../types/card";

// TODO: Links will be stored in database in future
const demoLinks: Link[] = [];

interface BacklinkItem {
  card: CardData;
  context?: string; // Snippet showing the link context
}

export function CardDetail() {
  const params = useParams();
  const [currentCard, setCurrentCard] = createSignal<CardData | null>(null);
  
  // Initialize store and find card
  onMount(async () => {
    await cardStore.initialize();
  });
  
  // Update current card when cards or params change
  createEffect(() => {
    const found = cardStore.cards().find(c => c.id === params.id);
    if (found) {
      setCurrentCard(found);
    } else if (!cardStore.loading()) {
      // Try to fetch from database if not in local state
      if (params.id) {
        cardStore.getCardById(params.id).then(card => {
          setCurrentCard(card);
        });
      }
    }
  });
  
  // Find direct links (cards this card links to)
  const directLinks = (): CardData[] => {
    const links = demoLinks.filter(l => l.source_id === params.id);
    return links.map(l => cardStore.cards().find(c => c.id === l.target_id)).filter(Boolean) as CardData[];
  };
  
  // Find backlinks (cards that link to this card)
  const backlinks = (): BacklinkItem[] => {
    const links = demoLinks.filter(l => l.target_id === params.id);
    return links.map(l => ({
      card: cardStore.cards().find(c => c.id === l.source_id)!,
      context: "...このカードにリンクしています..."
    })).filter(item => item.card);
  };
  
  // Find 2-hop links (what the direct links link to)
  const twoHopLinks = (): CardData[] => {
    const directIds = directLinks().map(c => c.id);
    const secondaryLinks = demoLinks.filter(l => directIds.includes(l.source_id) && l.target_id !== params.id);
    return secondaryLinks.map(l => cardStore.cards().find(c => c.id === l.target_id)).filter(Boolean) as CardData[];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div class="min-h-screen bg-[var(--bg-base)]">
      {/* Header */}
      <header class="sticky top-0 z-sticky bg-[var(--bg-base)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]">
        <div class="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <A href="/" class="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              ← 戻る
            </A>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              編集
            </Button>
            <Button variant="ghost" size="sm" color="danger">
              削除
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main class="max-w-4xl mx-auto px-6 py-8">
        <Show 
          when={currentCard()} 
          fallback={
            <div class="text-center py-16">
              <p class="text-[var(--text-secondary)]">カードが見つかりません</p>
              <A href="/">
                <Button variant="flat" color="primary" class="mt-4">
                  ホームに戻る
                </Button>
              </A>
            </div>
          }
        >
          {(cardData) => (
            <>
              {/* Card Content */}
              <article class="zedi-card p-8">
                <h1 class="text-3xl font-bold text-[var(--text-primary)] mb-4">
                  {cardData().title}
                </h1>
                
                <div class="flex items-center gap-4 text-sm text-[var(--text-tertiary)] mb-6">
                  <span>作成: {formatDate(cardData().created_at)}</span>
                  <Show when={cardData().updated_at !== cardData().created_at}>
                    <span>更新: {formatDate(cardData().updated_at)}</span>
                  </Show>
                </div>

                <div 
                  class="prose prose-lg dark:prose-invert max-w-none text-[var(--text-secondary)]"
                  innerHTML={cardData().content}
                />
              </article>

              {/* Links Section */}
              <section class="mt-8">
                <h2 class="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  🔗 リンク
                  <Badge variant="flat" color="primary" size="sm">
                    {directLinks().length + backlinks().length + twoHopLinks().length}
                  </Badge>
                </h2>

                {/* Direct Links */}
                <Show when={directLinks().length > 0}>
                  <div class="mb-6">
                    <h3 class="text-sm font-medium text-[var(--text-tertiary)] mb-3 flex items-center gap-2">
                      リンク先
                      <span class="text-xs">（このカードからのリンク）</span>
                    </h3>
                    <div class="space-y-2">
                      <For each={directLinks()}>
                        {(linkedCard) => (
                          <A href={`/card/${linkedCard.id}`}>
                            <Card isPressable isHoverable class="p-3">
                              <div class="flex items-center gap-3">
                                <span class="w-2 h-2 rounded-full bg-success-500" />
                                <span class="text-sm font-medium text-[var(--text-primary)]">
                                  {linkedCard.title}
                                </span>
                              </div>
                            </Card>
                          </A>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Backlinks */}
                <Show when={backlinks().length > 0}>
                  <div class="mb-6">
                    <h3 class="text-sm font-medium text-[var(--text-tertiary)] mb-3 flex items-center gap-2">
                      バックリンク
                      <span class="text-xs">（このカードへのリンク）</span>
                    </h3>
                    <div class="space-y-2">
                      <For each={backlinks()}>
                        {(item) => (
                          <A href={`/card/${item.card.id}`}>
                            <Card isPressable isHoverable class="p-3">
                              <div class="flex items-center gap-3">
                                <span class="w-2 h-2 rounded-full bg-primary-500" />
                                <div>
                                  <span class="text-sm font-medium text-[var(--text-primary)]">
                                    {item.card.title}
                                  </span>
                                  <Show when={item.context}>
                                    <p class="text-xs text-[var(--text-tertiary)] mt-1">
                                      {item.context}
                                    </p>
                                  </Show>
                                </div>
                              </div>
                            </Card>
                          </A>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* 2-hop Links */}
                <Show when={twoHopLinks().length > 0}>
                  <div>
                    <h3 class="text-sm font-medium text-[var(--text-tertiary)] mb-3 flex items-center gap-2">
                      2ホップリンク
                      <span class="text-xs">（リンク先のカードからのリンク）</span>
                    </h3>
                    <div class="space-y-2">
                      <For each={twoHopLinks()}>
                        {(linkedCard) => (
                          <A href={`/card/${linkedCard.id}`}>
                            <Card isPressable isHoverable class="p-3">
                              <div class="flex items-center gap-3">
                                <span class="w-2 h-2 rounded-full bg-accent-500" />
                                <span class="text-sm font-medium text-[var(--text-primary)]">
                                  {linkedCard.title}
                                </span>
                              </div>
                            </Card>
                          </A>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* No Links */}
                <Show when={directLinks().length === 0 && backlinks().length === 0 && twoHopLinks().length === 0}>
                  <div class="text-center py-8 bg-[var(--bg-base)] rounded-xl">
                    <p class="text-[var(--text-tertiary)]">
                      まだリンクがありません
                    </p>
                    <p class="text-sm text-[var(--text-tertiary)] mt-1">
                      <code class="px-1 py-0.5 bg-[var(--bg-card)] rounded">[[キーワード]]</code> で他のカードとリンクできます
                    </p>
                  </div>
                </Show>
              </section>
            </>
          )}
        </Show>
      </main>
    </div>
  );
}

export default CardDetail;

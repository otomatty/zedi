import { createSignal, For } from "solid-js";
import { A } from "@solidjs/router";
import { Button } from "./components/ui/Button";
import { Card, CardHeader, CardContent, CardTitle } from "./components/ui/Card";
import { Badge } from "./components/ui";
import { SearchDialog } from "./components/search";

function App() {
  const [darkMode, setDarkMode] = createSignal(false);

  const sampleCards = [
    {
      id: "1",
      title: "👋 Zediへようこそ",
      content:
        "Zediは「書くストレス」と「整理する義務」からあなたを解放します。思いついたことを、ただ書く。それだけで知識のネットワークが生まれます。",
      createdAt: "2分前",
    },
    {
      id: "2",
      title: "🔗 リンクの繋ぎ方",
      content:
        "テキスト中に [[キーワード]] と入力するだけで、カード同士が繋がります。まだ存在しないカードへのリンク（Ghost Link）も作成できます。",
      createdAt: "5分前",
    },
    {
      id: "3",
      title: "🤖 AIの使い方",
      content:
        "/wiki コマンドを使うと、AIが選択したキーワードについて解説と関連トピックへのリンクを含むカードを自動生成します。",
      createdAt: "10分前",
    },
  ];

  const toggleDarkMode = () => {
    setDarkMode(!darkMode());
    document.documentElement.classList.toggle("dark", !darkMode());
  };

  return (
    <div class={`min-h-screen transition-colors duration-300 ${darkMode() ? "dark" : ""}`}>
      {/* Global Search Dialog */}
      <SearchDialog onSelectCard={(cardId) => console.log("Selected card:", cardId)} />

      {/* Header */}
      <header class="sticky top-0 z-sticky bg-[var(--bg-base)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]">
        <div class="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
              <span class="text-white font-bold text-sm">Z</span>
            </div>
            <h1 class="text-xl font-semibold text-[var(--text-primary)]">Zedi</h1>
            <span class="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300 font-medium">
              Design System
            </span>
          </div>
          <div class="flex items-center gap-2">
            <A href="/ui-library">
              <Button variant="flat" color="secondary" size="sm">
                📚 UIライブラリ
              </Button>
            </A>
            <Button variant="ghost" size="sm" onClick={toggleDarkMode}>
              {darkMode() ? "☀️ Light" : "🌙 Dark"}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main class="max-w-4xl mx-auto px-6 py-8">
        {/* UI Library Link Card */}
        <A href="/ui-library" class="block">
          <Card isPressable isHoverable class="mb-8 bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-950/50 dark:to-accent-950/50 border-primary-200 dark:border-primary-800">
            <CardContent class="flex items-center justify-between py-6">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-primary-500 flex items-center justify-center text-white text-xl">
                  📚
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-[var(--text-primary)]">UIコンポーネントライブラリ</h3>
                  <p class="text-sm text-[var(--text-secondary)]">13種類の基礎コンポーネントを確認</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Badge variant="flat" color="primary">New</Badge>
                <svg class="w-5 h-5 text-[var(--text-tertiary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </CardContent>
          </Card>
        </A>

        {/* Design System Demo Section */}
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-2">
            デザインシステム
          </h2>
          <p class="text-[var(--text-secondary)] mb-6">
            Kobalte + TailwindCSS v4 で構築された Zedi のデザイン基盤です。
          </p>

          {/* Colors */}
          <div class="mb-8">
            <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-4">
              カラーパレット
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div class="text-sm font-medium text-[var(--text-secondary)] mb-2">Primary</div>
                <div class="flex gap-1">
                  <div class="w-8 h-8 rounded-lg bg-primary-300" />
                  <div class="w-8 h-8 rounded-lg bg-primary-500" />
                  <div class="w-8 h-8 rounded-lg bg-primary-700" />
                </div>
              </div>
              <div>
                <div class="text-sm font-medium text-[var(--text-secondary)] mb-2">Accent</div>
                <div class="flex gap-1">
                  <div class="w-8 h-8 rounded-lg bg-accent-300" />
                  <div class="w-8 h-8 rounded-lg bg-accent-500" />
                  <div class="w-8 h-8 rounded-lg bg-accent-700" />
                </div>
              </div>
              <div>
                <div class="text-sm font-medium text-[var(--text-secondary)] mb-2">Neutral</div>
                <div class="flex gap-1">
                  <div class="w-8 h-8 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
                  <div class="w-8 h-8 rounded-lg bg-neutral-500" />
                  <div class="w-8 h-8 rounded-lg bg-neutral-800" />
                </div>
              </div>
              <div>
                <div class="text-sm font-medium text-[var(--text-secondary)] mb-2">Semantic</div>
                <div class="flex gap-1">
                  <div class="w-8 h-8 rounded-lg bg-success-500" />
                  <div class="w-8 h-8 rounded-lg bg-warning-500" />
                  <div class="w-8 h-8 rounded-lg bg-error-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div class="mb-8">
            <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-4">
              ボタン
            </h3>
            <div class="flex flex-wrap gap-3">
              <Button variant="solid" color="primary">Solid</Button>
              <Button variant="bordered" color="primary">Bordered</Button>
              <Button variant="flat" color="primary">Flat</Button>
              <Button variant="light" color="primary">Light</Button>
              <Button variant="ghost" color="primary">Ghost</Button>
              <Button variant="shadow" color="primary">Shadow</Button>
              <Button variant="solid" color="danger">Danger</Button>
              <Button variant="solid" color="primary" disabled>
                Disabled
              </Button>
            </div>
            <div class="flex flex-wrap gap-3 mt-4">
              <Button variant="solid" color="primary" size="sm">Small</Button>
              <Button variant="solid" color="primary" size="md">Medium</Button>
              <Button variant="solid" color="primary" size="lg">Large</Button>
            </div>
          </div>
        </section>

        {/* Time Axis Demo */}
        <section>
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-1">
                Time Axis
              </h2>
              <p class="text-[var(--text-secondary)]">
                思考の流れを時系列で表示
              </p>
            </div>
            <Button variant="solid" color="primary" size="sm">
              + 新規カード
            </Button>
          </div>

          {/* Cards */}
          <div class="space-y-4">
            <For each={sampleCards}>
              {(card) => (
                <Card isPressable isHoverable class="animate-[slide-up_0.3s_ease-out]">
                  <CardHeader>
                    <div class="flex items-center justify-between">
                      <CardTitle>{card.title}</CardTitle>
                      <span class="text-xs text-[var(--text-tertiary)]">
                        {card.createdAt}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p class="text-[var(--text-secondary)] leading-relaxed">
                      {card.content}
                    </p>
                  </CardContent>
                </Card>
              )}
            </For>
          </div>
        </section>

        {/* Link Demo */}
        <section class="mt-12 p-6 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border border-[var(--border-subtle)]">
          <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-4">
            リンクスタイル
          </h3>
          <p class="text-[var(--text-secondary)] leading-relaxed">
            これは通常のテキストです。
            <a href="#" class="zedi-link">既存カードへのリンク</a> はハイライト表示され、
            <span class="zedi-ghost-link">未作成のカード</span> は点線で表示されます。
            また、入力中に検出された <span class="zedi-link-suggestion">リンク候補</span> は
            ドット線でハイライトされます。
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer class="border-t border-[var(--border-subtle)] mt-12">
        <div class="max-w-4xl mx-auto px-6 py-6 text-center text-sm text-[var(--text-tertiary)]">
          Zedi Design System • Kobalte + TailwindCSS v4
        </div>
      </footer>
    </div>
  );
}

export default App;

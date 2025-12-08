import type { CreateCardInput } from "../types/card";

export const SEED_CARDS: CreateCardInput[] = [
  {
    title: "👋 Zediへようこそ",
    content: `
      <h2>思考を解き放つ、新しいメモ体験へ。</h2>
      <p>Zediは「書くストレス」と「整理する義務」からあなたを解放するために設計されました。</p>
      
      <h3>🚀 3つの基本哲学</h3>
      <ul>
        <li><strong>Speed & Flow</strong>: 起動は0秒。思考を止めずに、ただ書き始めましょう。</li>
        <li><strong>Context over Folder</strong>: フォルダ整理は不要です。情報は「いつ書いたか」と「何と繋がっているか」で整理されます。</li>
        <li><strong>Local-First</strong>: データは常にあなたのデバイスにあります。オフラインでも完全に動作します。</li>
      </ul>

      <blockquote>
        <p>「整理しようとしないこと。それが最も高度な整理術です。」</p>
      </blockquote>
    `
  },
  {
    title: "🔗 リンクの繋ぎ方",
    content: `
      <p>Zediの最も強力な機能は、カード同士を有機的に繋げることです。</p>

      <h3>使い方</h3>
      <p>テキストを入力中に <code>[[</code> とタイプするだけで、リンク補完メニューが開きます。</p>
      
      <ul>
        <li>既存のカードを選択してリンク</li>
        <li>新しい言葉を入力して<strong>Ghost Link</strong>（未作成カードへのリンク）を作成</li>
      </ul>

      <p>例えば、[[Zediの哲学]] や [[AI機能]] のように、まだ存在しない概念にもリンクを晴れます。これらは将来、カードとして実体化されるのを待っています。</p>
    `
  },
  {
    title: "🤖 AIの使い方",
    content: `
      <p>ZediのAIは、あなたの思考を代行するのではなく、<strong>足場（Scaffolding）</strong>を作るために存在します。</p>

      <h3>AI機能の例</h3>
      <ul>
        <li><strong>/wiki コマンド</strong>: キーワードを選択して実行すると、解説とともに関連トピックへのリンクを自動生成します。</li>
        <li><strong>自動タイトル</strong>: 書き散らしたメモの内容を理解し、適切なタイトルを自動で付けます。</li>
      </ul>
      
      <p>AIは「正解」を書くためではなく、あなたが飛び移るための「次の石」を置くパートナーです。</p>
    `
  }
];

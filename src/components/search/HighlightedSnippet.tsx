interface HighlightedSnippetProps {
  text: string;
}

/**
 * ハイライトされたスニペットを表示
 * 【keyword】形式を<mark>タグに変換して黄色でハイライト
 */
export function HighlightedSnippet({ text }: HighlightedSnippetProps) {
  // 【keyword】を分割してパーツに
  const parts = text.split(/【|】/);

  return (
    <p className="text-xs text-muted-foreground line-clamp-2">
      {parts.map((part, index) =>
        // 奇数インデックスがハイライト対象（【と】の間）
        index % 2 === 1 ? (
          <mark
            key={index}
            className="bg-yellow-200 text-yellow-900 px-0.5 rounded"
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </p>
  );
}

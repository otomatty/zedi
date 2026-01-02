import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Sparkles, Cloud, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/layout/Container";
import { cn } from "@/lib/utils";

interface PlanFeature {
  text: string;
  included: boolean;
}

interface PlanCardProps {
  name: string;
  description: string;
  price: string;
  priceNote?: string;
  features: PlanFeature[];
  buttonText: string;
  buttonVariant?: "default" | "outline";
  popular?: boolean;
  icon: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  current?: boolean;
}

const PlanCard: React.FC<PlanCardProps> = ({
  name,
  description,
  price,
  priceNote,
  features,
  buttonText,
  buttonVariant = "default",
  popular,
  icon,
  onSelect,
  disabled,
  current,
}) => {
  return (
    <Card
      className={cn(
        "relative flex flex-col",
        popular && "border-primary shadow-lg"
      )}
    >
      {popular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
          おすすめ
        </Badge>
      )}
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div>
            <CardTitle className="text-lg">{name}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="mb-6">
          <span className="text-3xl font-bold">{price}</span>
          {priceNote && (
            <span className="text-sm text-muted-foreground ml-2">
              {priceNote}
            </span>
          )}
        </div>
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Check
                className={cn(
                  "h-4 w-4 mt-0.5 shrink-0",
                  feature.included ? "text-primary" : "text-muted-foreground/30"
                )}
              />
              <span
                className={cn(
                  "text-sm",
                  !feature.included && "text-muted-foreground line-through"
                )}
              >
                {feature.text}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          variant={buttonVariant}
          onClick={onSelect}
          disabled={disabled || current}
        >
          {current ? "現在のプラン" : buttonText}
        </Button>
      </CardFooter>
    </Card>
  );
};

type PlanType = "free" | "pro";

const Pricing: React.FC = () => {
  // TODO: 実際のライセンス状態を取得する
  const [currentPlan] = useState<PlanType>("free");
  const [hasSyncSubscription] = useState(false);
  const [trialActive] = useState(false);
  const [trialDaysLeft] = useState(0);

  const handleSelectPro = () => {
    // TODO: LemonSqueezy チェックアウトを開く
    console.log("Pro プラン購入");
  };

  const handleSelectSync = () => {
    // TODO: LemonSqueezy Sync サブスク開始
    console.log("Sync サブスク開始");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Container className="flex h-16 items-center gap-4">
          <Link to="/home">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">プラン</h1>
        </Container>
      </header>

      {/* Content */}
      <main className="py-8">
        <Container>
          {/* トライアル通知 */}
          {trialActive && (
              <div className="mb-8 p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
                <p className="text-sm font-medium">
                  🎉 無料トライアル中 - 残り{trialDaysLeft}日
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Pro機能とクラウド同期をお試しいただけます
                </p>
              </div>
            )}

            {/* 見出し */}
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold mb-2">
                シンプルな料金プラン
              </h2>
              <p className="text-muted-foreground">
                買い切りで永続利用。長く使うほどお得です。
              </p>
            </div>

            {/* プランカード */}
            <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
              {/* Free プラン */}
              <PlanCard
                name="Free"
                description="基本機能を無料で"
                price="¥0"
                icon={<Sparkles className="h-5 w-5" />}
                features={[
                  { text: "100ページまで", included: true },
                  { text: "ローカル保存", included: true },
                  { text: "Wiki リンク", included: true },
                  { text: "AI Wiki生成（自分のAPIキー）", included: true },
                  { text: "無制限ページ", included: false },
                  { text: "クラウド同期", included: false },
                ]}
                buttonText="現在のプラン"
                buttonVariant="outline"
                current={currentPlan === "free"}
              />

              {/* Pro プラン */}
              <PlanCard
                name="Pro"
                description="買い切りで永続利用"
                price="¥4,980"
                priceNote="買い切り"
                icon={<Zap className="h-5 w-5" />}
                popular
                features={[
                  { text: "無制限ページ", included: true },
                  { text: "ローカル保存", included: true },
                  { text: "Wiki リンク", included: true },
                  { text: "AI Wiki生成（自分のAPIキー）", included: true },
                  { text: "現行バージョン永続利用", included: true },
                  { text: "クラウド同期（別途契約）", included: true },
                ]}
                buttonText="Pro を購入"
                onSelect={handleSelectPro}
                current={currentPlan === "pro"}
              />

              {/* Sync アドオン */}
              <PlanCard
                name="Sync"
                description="Proユーザー向けオプション"
                price="¥2,980"
                priceNote="/ 年"
                icon={<Cloud className="h-5 w-5" />}
                features={[
                  { text: "クラウド同期", included: true },
                  { text: "マルチデバイス対応", included: true },
                  { text: "自動バックアップ", included: true },
                  { text: "オフライン対応", included: true },
                  { text: "月額プラン: ¥400/月", included: true },
                  { text: "Pro購入が必要", included: true },
                ]}
                buttonText="Sync を契約"
                buttonVariant="outline"
                onSelect={handleSelectSync}
                disabled={currentPlan !== "pro"}
                current={hasSyncSubscription}
              />
            </div>

            {/* 補足情報 */}
            <div className="mt-12 max-w-3xl mx-auto">
              <h3 className="text-lg font-semibold mb-4 text-center">
                よくある質問
              </h3>
              <div className="space-y-4">
                <div className="p-4 rounded-lg border">
                  <h4 className="font-medium mb-1">
                    メジャーアップデート時はどうなりますか？
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    現行バージョンは引き続き利用できます。新バージョンへのアップグレードは任意で、
                    既存ユーザーは割引価格（¥3,480）でアップグレードできます。
                  </p>
                </div>
                <div className="p-4 rounded-lg border">
                  <h4 className="font-medium mb-1">
                    AI Wiki生成機能は有料ですか？
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    いいえ。AIウィキ生成は全プランで利用可能です。
                    お手持ちのOpenAI/Anthropic等のAPIキーを設定してご利用ください。
                  </p>
                </div>
                <div className="p-4 rounded-lg border">
                  <h4 className="font-medium mb-1">
                    返金ポリシーはありますか？
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    購入後14日以内であれば全額返金いたします。
                    お問い合わせフォームからご連絡ください。
                  </p>
                </div>
              </div>
            </div>

            {/* 価格比較 */}
            <div className="mt-12 max-w-3xl mx-auto">
              <h3 className="text-lg font-semibold mb-4 text-center">
                他サービスとの比較（2年間利用時）
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">サービス</th>
                      <th className="text-right py-3 px-4">1年目</th>
                      <th className="text-right py-3 px-4">2年目</th>
                      <th className="text-right py-3 px-4">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b bg-primary/5">
                      <td className="py-3 px-4 font-medium">Zedi Pro + Sync</td>
                      <td className="text-right py-3 px-4">¥7,960</td>
                      <td className="text-right py-3 px-4">¥2,980</td>
                      <td className="text-right py-3 px-4 font-bold text-primary">
                        ¥10,940
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3 px-4">Obsidian + Sync</td>
                      <td className="text-right py-3 px-4">¥14,400</td>
                      <td className="text-right py-3 px-4">¥14,400</td>
                      <td className="text-right py-3 px-4">¥28,800</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3 px-4">Notion Pro</td>
                      <td className="text-right py-3 px-4">¥14,400</td>
                      <td className="text-right py-3 px-4">¥14,400</td>
                      <td className="text-right py-3 px-4">¥28,800</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3 px-4">Craft</td>
                      <td className="text-right py-3 px-4">¥9,000</td>
                      <td className="text-right py-3 px-4">¥9,000</td>
                      <td className="text-right py-3 px-4">¥18,000</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-3">
                ※ 為替レート 1ドル = 150円 で計算
              </p>
            </div>
        </Container>
      </main>
    </div>
  );
};

export default Pricing;

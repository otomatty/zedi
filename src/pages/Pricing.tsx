import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Sparkles, Zap } from "lucide-react";
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
import { UsageBar } from "@/components/ai/UsageBar";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { openProCheckout, openCustomerPortal } from "@/lib/subscriptionService";
import type { AIUsage } from "@/types/ai";

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
  extraContent?: React.ReactNode;
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
  extraContent,
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
        {extraContent && <div className="mt-4">{extraContent}</div>}
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

type BillingInterval = "monthly" | "yearly";

const Pricing: React.FC = () => {
  const { userId, isSignedIn } = useAuth();
  const {
    plan: currentPlan,
    isProUser,
    usage,
    isLoading,
    refetch,
  } = useSubscription();

  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("monthly");

  const usageForBar: AIUsage | null = usage
    ? {
        usagePercent: usage.usagePercent,
        consumedUnits: usage.consumedUnits,
        budgetUnits: usage.budgetUnits,
        remaining: Math.max(0, usage.budgetUnits - usage.consumedUnits),
        tier: currentPlan,
        yearMonth: new Date().toISOString().slice(0, 7),
      }
    : null;

  const handleSelectPro = () => {
    if (!userId) return;
    openProCheckout(userId, billingInterval);
    // User may return from checkout in same tab; refetch after a short delay
    setTimeout(() => refetch(), 2000);
  };

  const handleManageSubscription = () => {
    openCustomerPortal();
  };

  return (
    <div className="min-h-screen bg-background">
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

      <main className="py-8">
        <Container>
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">シンプルな料金プラン</h2>
            <p className="text-muted-foreground">
              Free で基本機能とクラウド同期。Pro で無制限ページとフルAI機能。
            </p>
          </div>

          {/* Monthly / Yearly toggle for Pro */}
          <div className="flex justify-center gap-2 mb-6">
            <Button
              variant={billingInterval === "monthly" ? "default" : "outline"}
              size="sm"
              onClick={() => setBillingInterval("monthly")}
            >
              月額
            </Button>
            <Button
              variant={billingInterval === "yearly" ? "default" : "outline"}
              size="sm"
              onClick={() => setBillingInterval("yearly")}
            >
              年額（2ヶ月分お得）
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
            <PlanCard
              name="Free"
              description="基本機能を無料で"
              price="¥0"
              icon={<Sparkles className="h-5 w-5" />}
              features={[
                { text: "100ページまで", included: true },
                { text: "クラウド同期", included: true },
                { text: "Wiki リンク", included: true },
                { text: "基本AIモデル（制限付き）", included: true },
                { text: "無制限ページ", included: false },
                { text: "高性能AIモデル", included: false },
              ]}
              buttonText="現在のプラン"
              buttonVariant="outline"
              current={!isProUser}
              extraContent={
                isSignedIn &&
                usageForBar && (
                  <UsageBar usage={usageForBar} autoRefresh={false} />
                )
              }
            />

            <PlanCard
              name="Pro"
              description="無制限＋フルAI"
              price={billingInterval === "yearly" ? "$100" : "$10"}
              priceNote={billingInterval === "yearly" ? "/ 年" : "/ 月"}
              icon={<Zap className="h-5 w-5" />}
              popular
              features={[
                { text: "無制限ページ", included: true },
                { text: "クラウド同期", included: true },
                { text: "Wiki リンク", included: true },
                { text: "全AIモデル（GPT-4o, Claude, Gemini Pro等）", included: true },
                { text: "月間AI使用量 拡大", included: true },
                { text: "自分のAPIキーも使用可", included: true },
              ]}
              buttonText={
                isProUser
                  ? "サブスク管理"
                  : billingInterval === "yearly"
                    ? "Pro 年額で契約"
                    : "Pro 月額で契約"
              }
              onSelect={isProUser ? handleManageSubscription : handleSelectPro}
              current={isProUser}
              disabled={!isSignedIn}
            />
          </div>

          {isLoading && (
            <p className="text-center text-sm text-muted-foreground mt-4">
              プラン情報を取得中...
            </p>
          )}

          <div className="mt-12 max-w-3xl mx-auto">
            <h3 className="text-lg font-semibold mb-4 text-center">
              AI機能について
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 rounded-lg border">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Free プラン
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>- 基本モデル（GPT-4o Mini, Gemini Flash 等）</li>
                  <li>- 月間使用量の制限あり</li>
                  <li>- Wiki生成、Mermaid図 生成</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Pro プラン
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>- 高性能モデル（GPT-4o, Claude Sonnet 4, Gemini Pro 等）</li>
                  <li>- 月間使用量が大幅に拡大</li>
                  <li>- 今後追加されるAI機能も利用可能</li>
                </ul>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-4">
              自分のAPIキーを設定すると、プラン制限なく全モデルを利用できます。
            </p>
          </div>

          <div className="mt-12 max-w-3xl mx-auto">
            <h3 className="text-lg font-semibold mb-4 text-center">
              よくある質問
            </h3>
            <div className="space-y-4">
              <div className="p-4 rounded-lg border">
                <h4 className="font-medium mb-1">
                  Proプランの使用量はどう計算されますか？
                </h4>
                <p className="text-sm text-muted-foreground">
                  利用するモデルとトークン消費量に応じたコストユニットで計算されます。
                  軽量モデルなら月に数百回の生成が可能です。
                  設定画面で現在の使用率を確認できます。
                </p>
              </div>
              <div className="p-4 rounded-lg border">
                <h4 className="font-medium mb-1">
                  自分のAPIキーとサブスクの違いは？
                </h4>
                <p className="text-sm text-muted-foreground">
                  サブスクではZediのAI基盤を通じて簡単にAI機能を使えます。
                  自分のAPIキーを設定すると使用量制限なく利用できますが、
                  各プロバイダーとの個別契約と料金が必要です。
                </p>
              </div>
              <div className="p-4 rounded-lg border">
                <h4 className="font-medium mb-1">返金ポリシーはありますか？</h4>
                <p className="text-sm text-muted-foreground">
                  購入後14日以内であれば全額返金いたします。
                  お問い合わせフォームからご連絡ください。
                </p>
              </div>
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
};

export default Pricing;

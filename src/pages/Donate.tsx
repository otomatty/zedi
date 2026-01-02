import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Coffee, Heart, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Container from "@/components/layout/Container";

interface DonationOptionProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  amount: string;
  href: string;
}

const DonationOption: React.FC<DonationOptionProps> = ({
  icon,
  title,
  description,
  amount,
  href,
}) => {
  return (
    <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group">
      <a href={href} target="_blank" rel="noopener noreferrer">
        <CardHeader className="flex flex-row items-center gap-4 pb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            {icon}
          </div>
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              {title}
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardTitle>
            <CardDescription className="text-sm">{description}</CardDescription>
          </div>
          <div className="text-lg font-bold text-primary">{amount}</div>
        </CardHeader>
      </a>
    </Card>
  );
};

const Donate: React.FC = () => {
  // TODO: 実際の寄付リンクに置き換える
  const donationLinks = {
    coffee: "https://ko-fi.com/zedi",
    lunch: "https://ko-fi.com/zedi",
    dinner: "https://ko-fi.com/zedi",
    custom: "https://ko-fi.com/zedi",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Container className="flex h-16 items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">サポート</h1>
        </Container>
      </header>

      {/* Content */}
      <main className="py-8">
        <Container>
          <div className="max-w-2xl mx-auto">
            {/* Hero Section */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 text-white mb-4">
                <Heart className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold mb-3">Zedi をサポート</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Zedi は個人で開発・運営しています。
                皆さまからのサポートが開発を続けるモチベーションになります。
              </p>
            </div>

            {/* Donation Options */}
            <div className="space-y-4 mb-10">
              <DonationOption
                icon={<Coffee className="h-5 w-5" />}
                title="コーヒー1杯"
                description="開発中の眠気覚ましに"
                amount="$5"
                href={donationLinks.coffee}
              />
              <DonationOption
                icon={<span className="text-xl">🍱</span>}
                title="ランチ1回"
                description="お昼ごはんをごちそうしてください"
                amount="$15"
                href={donationLinks.lunch}
              />
              <DonationOption
                icon={<Sparkles className="h-5 w-5" />}
                title="ディナー1回"
                description="特別な感謝の気持ちを込めて"
                amount="$50"
                href={donationLinks.dinner}
              />
              <DonationOption
                icon={<Heart className="h-5 w-5" />}
                title="カスタム金額"
                description="お好きな金額でサポート"
                amount="任意"
                href={donationLinks.custom}
              />
            </div>

            {/* Thank You Message */}
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="py-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    💜 サポートしてくださった方へ
                  </p>
                  <p className="text-sm">
                    いただいたサポートは、サーバー費用・開発ツール・
                    新機能の開発に使わせていただきます。
                    本当にありがとうございます！
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Other Ways to Support */}
            <div className="mt-10">
              <h3 className="text-lg font-semibold mb-4 text-center">
                その他のサポート方法
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⭐</span>
                      <div>
                        <p className="font-medium text-sm">GitHub でスターを付ける</p>
                        <p className="text-xs text-muted-foreground">
                          開発の励みになります
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📣</span>
                      <div>
                        <p className="font-medium text-sm">SNS でシェアする</p>
                        <p className="text-xs text-muted-foreground">
                          より多くの人に届けてください
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🐛</span>
                      <div>
                        <p className="font-medium text-sm">バグを報告する</p>
                        <p className="text-xs text-muted-foreground">
                          品質向上にご協力ください
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">💡</span>
                      <div>
                        <p className="font-medium text-sm">機能をリクエストする</p>
                        <p className="text-xs text-muted-foreground">
                          ご意見をお聞かせください
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
};

export default Donate;

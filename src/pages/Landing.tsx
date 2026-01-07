import React from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SignedIn, SignedOut, useAuth } from "@clerk/clerk-react";
import {
  FileText,
  Link as LinkIcon,
  Search,
  Cloud,
  Sparkles,
  ArrowRight,
} from "lucide-react";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({
  icon,
  title,
  description,
}) => (
  <Card className="border-border/50 bg-card/50 backdrop-blur">
    <CardContent className="pt-6">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);

const Landing: React.FC = () => {
  const { isSignedIn, isLoaded } = useAuth();

  // Show loading state while Clerk is initializing
  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Redirect to /home if user is signed in
  if (isSignedIn) {
    return <Navigate to="/home" replace />;
  }

  const features = [
    {
      icon: <FileText className="h-6 w-6" />,
      title: "シンプルなメモ",
      description:
        "マークダウン対応のリッチエディタで、思考をすばやく記録できます。",
    },
    {
      icon: <LinkIcon className="h-6 w-6" />,
      title: "双方向リンク",
      description:
        "[[ページ名]] で簡単にリンク。アイデアをつなげてナレッジグラフを構築。",
    },
    {
      icon: <Search className="h-6 w-6" />,
      title: "高速検索",
      description:
        "全文検索でどこからでも瞬時にメモを見つけ出せます。",
    },
    {
      icon: <Cloud className="h-6 w-6" />,
      title: "クラウド同期",
      description:
        "ローカルファースト設計。オフラインでも使え、自動でクラウドに同期。",
    },
    {
      icon: <Sparkles className="h-6 w-6" />,
      title: "AI支援",
      description:
        "AIがメモの整理や図表の生成をサポート。知識の活用を加速します。",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Zedi
          </h1>
          <div className="flex items-center gap-4">
            <SignedOut>
              <Link to="/sign-in">
                <Button variant="ghost" size="sm">
                  サインイン
                </Button>
              </Link>
              <Link to="/sign-in">
                <Button size="sm">無料で始める</Button>
              </Link>
            </SignedOut>
            <SignedIn>
              <Link to="/home">
                <Button size="sm">
                  アプリを開く
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </SignedIn>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
              思考を繋げる
            </span>
            <br />
            パーソナルナレッジベース
          </h2>
          <p className="mb-8 text-lg text-muted-foreground sm:text-xl">
            Zediは、あなたのアイデアとメモを双方向リンクで結びつけ、
            <br className="hidden sm:block" />
            知識のネットワークを構築するためのツールです。
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <SignedOut>
              <Link to="/sign-in">
                <Button size="lg" className="w-full sm:w-auto">
                  無料で始める
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </SignedOut>
            <SignedIn>
              <Link to="/home">
                <Button size="lg" className="w-full sm:w-auto">
                  アプリを開く
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </SignedIn>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h3 className="mb-12 text-center text-2xl font-bold sm:text-3xl">
            主な機能
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <FeatureCard key={index} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-8 text-center sm:p-12">
          <h3 className="mb-4 text-2xl font-bold sm:text-3xl">
            今すぐ始めましょう
          </h3>
          <p className="mb-6 text-muted-foreground">
            無料でアカウントを作成して、あなたのナレッジベースを構築しましょう。
          </p>
          <SignedOut>
            <Link to="/sign-in">
              <Button size="lg">
                無料で始める
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </SignedOut>
          <SignedIn>
            <Link to="/home">
              <Button size="lg">
                アプリを開く
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </SignedIn>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Zedi. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;

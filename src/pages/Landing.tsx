import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@zedi/ui";
import { Card, CardContent } from "@zedi/ui";
import { useAuth, SignedIn, SignedOut } from "@/hooks/useAuth";
import { FileText, Link as LinkIcon, Search, Cloud, Sparkles, ArrowRight } from "lucide-react";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => (
  <Card className="border-border/50 bg-card/50 backdrop-blur">
    <CardContent className="pt-6">
      <div className="bg-primary/10 text-primary mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </CardContent>
  </Card>
);

/**
 *
 */
const Landing: React.FC = () => {
  const { t } = useTranslation();
  const { isSignedIn, isLoaded } = useAuth();

  // Show loading state while auth is initializing
  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
      </div>
    );
  }

  // サインイン済みのユーザはランディングを表示せず、`/notes/me` を経由して
  // デフォルトノートへ着地する（issue #825 で `/home` を廃止）。
  // Signed-in users skip the marketing landing and land on the default note
  // via `/notes/me` (issue #825 retires `/home`).
  if (isSignedIn) {
    return <Navigate to="/notes/me" replace />;
  }

  const features = [
    {
      icon: <FileText className="h-6 w-6" />,
      title: t("landing.feature1Title"),
      description: t("landing.feature1Description"),
    },
    {
      icon: <LinkIcon className="h-6 w-6" />,
      title: t("landing.feature2Title"),
      description: t("landing.feature2Description"),
    },
    {
      icon: <Search className="h-6 w-6" />,
      title: t("landing.feature3Title"),
      description: t("landing.feature3Description"),
    },
    {
      icon: <Cloud className="h-6 w-6" />,
      title: t("landing.feature4Title"),
      description: t("landing.feature4Description"),
    },
    {
      icon: <Sparkles className="h-6 w-6" />,
      title: t("landing.feature5Title"),
      description: t("landing.feature5Description"),
    },
  ];

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <header className="border-border/50 bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="from-primary to-primary/70 bg-gradient-to-r bg-clip-text text-xl font-bold tracking-tight text-transparent">
            Zedi
          </h1>
          <div className="flex items-center gap-4">
            <SignedOut>
              <Link to="/sign-in">
                <Button size="sm">
                  {t("common.startUsingApp")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </SignedOut>
            <SignedIn>
              <Link to="/home">
                <Button size="sm">
                  {t("landing.openApp")}
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
            <span className="from-primary via-primary/80 to-primary/60 bg-gradient-to-r bg-clip-text text-transparent">
              {t("landing.heroTitle1")}
            </span>
            <br />
            {t("landing.heroTitle2")}
          </h2>
          <p className="text-muted-foreground mb-8 text-lg sm:text-xl">
            {t("landing.heroDescription")}
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <SignedOut>
              <Link to="/sign-in">
                <Button size="lg" className="w-full sm:w-auto">
                  {t("common.startUsingApp")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </SignedOut>
            <SignedIn>
              <Link to="/home">
                <Button size="lg" className="w-full sm:w-auto">
                  {t("landing.openApp")}
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
            {t("landing.featuresHeading")}
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
        <div className="from-primary/10 via-primary/5 to-primary/10 mx-auto max-w-2xl rounded-2xl bg-gradient-to-r p-8 text-center sm:p-12">
          <h3 className="mb-4 text-2xl font-bold sm:text-3xl">{t("landing.ctaTitle")}</h3>
          <p className="text-muted-foreground mb-6">{t("landing.ctaDescription")}</p>
          <SignedOut>
            <Link to="/sign-in">
              <Button size="lg">
                {t("common.startUsingApp")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </SignedOut>
          <SignedIn>
            <Link to="/home">
              <Button size="lg">
                {t("landing.openApp")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </SignedIn>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-border/50 border-t py-8">
        <div className="text-muted-foreground container mx-auto px-4 text-center text-sm">
          <p>© {new Date().getFullYear()} Zedi. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;

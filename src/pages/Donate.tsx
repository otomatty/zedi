import React from "react";
import { useTranslation } from "react-i18next";
import { Coffee, Heart, Sparkles, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@zedi/ui";
import Container from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";

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
    <Card className="group hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
      <a href={href} target="_blank" rel="noopener noreferrer">
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground flex h-12 w-12 items-center justify-center rounded-full transition-colors">
            {icon}
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {title}
              <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </CardTitle>
            <CardDescription className="text-sm">{description}</CardDescription>
          </div>
          <div className="text-primary text-lg font-bold">{amount}</div>
        </CardHeader>
      </a>
    </Card>
  );
};

/**
 *
 */
const Donate: React.FC = () => {
  const { t } = useTranslation();
  // TODO: 実際の寄付リンクに置き換える
  const donationLinks = {
    coffee: "https://ko-fi.com/zedi",
    lunch: "https://ko-fi.com/zedi",
    dinner: "https://ko-fi.com/zedi",
    custom: "https://ko-fi.com/zedi",
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("nav.support")} backTo="/home" backLabel={t("common.back")} />

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto py-8">
        <Container>
          <div className="mx-auto max-w-2xl">
            {/* Hero Section */}
            <div className="mb-10 text-center">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-400 text-white">
                <Heart className="h-8 w-8" />
              </div>
              <h2 className="mb-3 text-2xl font-bold">{t("donate.heroTitle")}</h2>
              <p className="text-muted-foreground mx-auto max-w-md">
                {t("donate.heroDescription")}
              </p>
            </div>

            {/* Donation Options */}
            <div className="mb-10 space-y-4">
              <DonationOption
                icon={<Coffee className="h-5 w-5" />}
                title={t("donate.coffeeTitle")}
                description={t("donate.coffeeDescription")}
                amount="$5"
                href={donationLinks.coffee}
              />
              <DonationOption
                icon={<span className="text-xl">🍱</span>}
                title={t("donate.lunchTitle")}
                description={t("donate.lunchDescription")}
                amount="$15"
                href={donationLinks.lunch}
              />
              <DonationOption
                icon={<Sparkles className="h-5 w-5" />}
                title={t("donate.dinnerTitle")}
                description={t("donate.dinnerDescription")}
                amount="$50"
                href={donationLinks.dinner}
              />
              <DonationOption
                icon={<Heart className="h-5 w-5" />}
                title={t("donate.customTitle")}
                description={t("donate.customDescription")}
                amount={t("donate.customAmount")}
                href={donationLinks.custom}
              />
            </div>

            {/* Thank You Message */}
            <Card className="border-primary/20 from-primary/5 to-primary/10 bg-gradient-to-br">
              <CardContent className="py-6">
                <div className="text-center">
                  <p className="text-muted-foreground mb-2 text-sm">
                    {t("donate.thankYouHeading")}
                  </p>
                  <p className="text-sm">{t("donate.thankYouBody")}</p>
                </div>
              </CardContent>
            </Card>

            {/* Other Ways to Support */}
            <div className="mt-10">
              <h3 className="mb-4 text-center text-lg font-semibold">
                {t("donate.otherWaysTitle")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⭐</span>
                      <div>
                        <p className="text-sm font-medium">{t("donate.githubStarTitle")}</p>
                        <p className="text-muted-foreground text-xs">
                          {t("donate.githubStarDescription")}
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
                        <p className="text-sm font-medium">{t("donate.shareTitle")}</p>
                        <p className="text-muted-foreground text-xs">
                          {t("donate.shareDescription")}
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
                        <p className="text-sm font-medium">{t("donate.reportBugTitle")}</p>
                        <p className="text-muted-foreground text-xs">
                          {t("donate.reportBugDescription")}
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
                        <p className="text-sm font-medium">{t("donate.requestFeatureTitle")}</p>
                        <p className="text-muted-foreground text-xs">
                          {t("donate.requestFeatureDescription")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </Container>
      </div>
    </div>
  );
};

export default Donate;

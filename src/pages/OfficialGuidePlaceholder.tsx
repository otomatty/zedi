import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { Button } from "@zedi/ui";
import Container from "@/components/layout/Container";

/**
 * 公式ノート「Zedi の使い方」のプレースホルダーページ。
 * Official guide note placeholder page.
 *
 * ウェルカムページから `/notes/official-guide` へリンクしても 404 にならない
 * よう、プレースホルダーを提供する。公式ノートの実装は別 PR で差し替える
 * 予定（README を参照）。ロケールは URL の `?lang=` で切り替える。
 *
 * The welcome page links to `/notes/official-guide`; this placeholder keeps
 * those links from 404-ing until the real note ships in a follow-up PR. The
 * locale follows the `?lang=` query parameter.
 */
export default function OfficialGuidePlaceholder() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col py-10">
      <Container>
        <div className="bg-card mx-auto max-w-xl rounded-lg border p-8 text-center">
          <div className="bg-accent mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <BookOpen className="text-accent-foreground h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold">{t("officialGuide.title")}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("officialGuide.comingSoonDescription")}
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link to="/home">{t("officialGuide.backToHome")}</Link>
            </Button>
          </div>
        </div>
      </Container>
    </div>
  );
}

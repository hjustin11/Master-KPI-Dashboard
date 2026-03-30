"use client";

import { useTranslation } from "@/i18n/I18nProvider";
import { SPACE_CAT_EMOTIONS } from "@/shared/components/tutorial/SpaceCatMascot";
import { MASCOT_CSS_ANIMATIONS, TutorialMascot } from "@/shared/components/tutorial/TutorialMascot";

export function MascotReferencePanel() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-muted/15 p-3">
      <div>
        <p className="text-xs font-medium">{t("tutorialEditor.mascotCatalogEmotions")}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("tutorialEditor.mascotCatalogEmotionsLead")}</p>
      </div>
      <div className="grid max-h-[min(420px,55vh)] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {SPACE_CAT_EMOTIONS.map((em) => (
          <div
            key={em}
            className="flex flex-col items-center gap-1 rounded-md border border-border/40 bg-background/70 p-2 shadow-sm"
          >
            <TutorialMascot emotion={em} animation="float" cosmoSize={44} />
            <span className="w-full truncate text-center font-mono text-[9px] text-muted-foreground" title={em}>
              {em}
            </span>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-medium">{t("tutorialEditor.mascotCatalogAnimations")}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t("tutorialEditor.mascotCatalogAnimationsLead")}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {MASCOT_CSS_ANIMATIONS.map((anim) => (
          <div
            key={anim}
            className="flex min-w-[5.5rem] flex-col items-center gap-1 rounded-md border border-border/40 bg-background/70 p-2 shadow-sm"
          >
            <TutorialMascot emotion="greeting" animation={anim} cosmoSize={52} />
            <span className="font-mono text-[10px] text-muted-foreground">{anim}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

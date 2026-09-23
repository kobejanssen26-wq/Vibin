import type { ActivityDTO } from "@shared/types";
import { useLang } from "../lib/i18n";

/** Credit line for description text adapted from a CC BY-SA source (Wikipedia). */
export function DescriptionCredit({ credit }: { credit: ActivityDTO["descriptionCredit"] }) {
  const { t } = useLang();
  if (!credit) return null;
  return (
    <p className="text-[11px] text-navy-400">
      {t("descCredit.source")}{" "}
      <a
        href={credit.url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-navy-600"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {credit.label}
      </a>{" "}
      (CC BY-SA 4.0)
    </p>
  );
}

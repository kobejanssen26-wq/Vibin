import type { ActivityDTO } from "@shared/types";

/** Credit line for description text adapted from a CC BY-SA source (Wikipedia). */
export function DescriptionCredit({ credit }: { credit: ActivityDTO["descriptionCredit"] }) {
  if (!credit) return null;
  return (
    <p className="text-[11px] text-navy-400">
      Source:{" "}
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

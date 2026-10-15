export const VERIFY_LABEL: Record<string, string> = {
  checked: "Gecontroleerd",
  uncertain: "Onzeker",
  unverified: "Ongeverifieerd",
};
export const VERIFY_TONE: Record<string, string> = { checked: "green", uncertain: "amber", unverified: "slate" };
export const MSG_LABEL: Record<string, string> = {
  draft: "Klaar voor controle",
  approved: "Goedgekeurd",
  queued: "In wachtrij",
  sending: "Wordt verzonden",
  sent: "Verzonden",
  failed: "Fout",
  cancelled: "Geannuleerd",
};
export const MSG_TONE: Record<string, string> = {
  draft: "blue",
  approved: "lime",
  queued: "lime",
  sending: "amber",
  sent: "green",
  failed: "red",
  cancelled: "slate",
};

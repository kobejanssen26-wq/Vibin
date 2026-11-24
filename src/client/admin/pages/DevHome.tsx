import { Link } from "react-router-dom";
import { useAdminAuth, useCan } from "../auth";
import { Badge, PageTitle, Panel } from "../ui";

/** Landing page for developers: what they may use, nothing about areas they can't reach. */
const TOOLS: { to: string; label: string; need: string; text: string }[] = [
  { to: "/admin/activities", label: "Activities", need: "catalogue", text: "Browse, edit and verify activities; import CSV." },
  { to: "/admin/quality", label: "Catalogue quality", need: "catalogue", text: "The quality audit and research results." },
  { to: "/admin/categories", label: "Categories", need: "catalogue", text: "Order and edit categories." },
  { to: "/admin/data-quality", label: "Data quality", need: "catalogue", text: "Missing or suspicious data." },
  { to: "/admin/events", label: "Live events", need: "events", text: "Events and ingestion sources." },
  { to: "/admin/support", label: "Support", need: "support", text: "Help-desk tickets." },
  { to: "/admin/reports", label: "Reports", need: "support", text: "User reports to review." },
  { to: "/admin/files", label: "File Manager", need: "files.read", text: "Browse and edit the project files." },
  { to: "/admin/team", label: "Team / Developers", need: "team.manage", text: "Invite and manage other developers." },
];

export function DevHome() {
  const { user } = useAdminAuth();
  const can = useCan();
  const mine = TOOLS.filter((t) => can(t.need));
  return (
    <>
      <PageTitle title={`Welcome, ${user?.displayName ?? "developer"}`} right={<Badge tone="blue">Developer</Badge>} />
      <Panel title="Your tools" subtitle="You can reach these areas. Anything else is reserved for the owner.">
        {mine.length === 0 ? (
          <p className="text-[13px] text-slate-600">
            You're signed in, but no permissions have been granted to you yet. Ask the owner to enable some.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="rounded-md border border-slate-200 p-3 transition-colors hover:border-brand-500 hover:bg-brand-50/40"
              >
                <p className="text-[13px] font-semibold text-slate-900">{t.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{t.text}</p>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

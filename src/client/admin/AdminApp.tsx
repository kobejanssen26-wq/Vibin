import { Suspense, lazy, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { AdminAuthProvider, useAdminAuth, useCan } from "./auth";
import { AuthScreens } from "./AuthScreens";
import { Shell } from "./Shell";
import { Loading } from "./ui";
import { Dashboard } from "./pages/Dashboard";
import { Users } from "./pages/Users";
import { UserDetail } from "./pages/UserDetail";
import { Groups } from "./pages/Groups";
import { GroupDetail } from "./pages/GroupDetail";
import { Activities } from "./pages/Activities";
import { ActivityDetail } from "./pages/ActivityDetail";
import { DataQuality } from "./pages/DataQuality";
import { Categories } from "./pages/Categories";
import { Events } from "./pages/Events";
import { Providers } from "./pages/Providers";
import { Outreach } from "./pages/Outreach";
import { Quality } from "./pages/Quality";
import { SwipeManager } from "./pages/SwipeManager";
import { ProviderDetail } from "./pages/ProviderDetail";
import { Analytics } from "./pages/Analytics";
import { Funnel } from "./pages/Funnel";
import { Errors } from "./pages/Errors";
import { System } from "./pages/System";
import { AuditLog } from "./pages/AuditLog";
import { Sessions } from "./pages/Sessions";
import { Flags } from "./pages/Flags";
import { Settings } from "./pages/Settings";
import { Vault } from "./pages/Vault";
import { Reports } from "./pages/Reports";
import { ReportDetail } from "./pages/ReportDetail";
import { Support } from "./pages/Support";
import { SupportTicket } from "./pages/SupportTicket";
import { Team } from "./pages/Team";
import { DevHome } from "./pages/DevHome";
import { AcceptInvite } from "./pages/AcceptInvite";

// The editor (CodeMirror) is a big chunk: only fetched when the File Manager is opened.
const FileManager = lazy(() => import("./pages/FileManager").then((m) => ({ default: m.FileManager })));

/** UI guard only: hides pages a developer has no permission for. The API enforces the same on every call. */
function Guard({ need, children }: { need: string; children: ReactNode }) {
  const can = useCan();
  if (can(need)) return <>{children}</>;
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-sm font-semibold text-slate-700">No access</p>
      <p className="mt-1 text-xs text-slate-500">This area is not part of your permissions.</p>
    </div>
  );
}

/** Placeholder for sections that land in a later phase. Keeps the nav honest. */
function Soon({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-xs text-slate-500">
        This section is being built. The backend and access control are already
        in place.
      </p>
    </div>
  );
}

function AdminRoutes() {
  const { stage, user } = useAdminAuth();

  if (stage === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100">
        <Loading label="Checking access…" />
      </div>
    );
  }
  if (stage !== "ready") return <AuthScreens stage={stage} />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={user?.role === "owner" ? <Dashboard /> : <DevHome />} />
        <Route path="/users" element={<Guard need="owner"><Users /></Guard>} />
        <Route path="/users/:id" element={<Guard need="owner"><UserDetail /></Guard>} />
        <Route path="/groups" element={<Guard need="owner"><Groups /></Guard>} />
        <Route path="/groups/:id" element={<Guard need="owner"><GroupDetail /></Guard>} />
        <Route path="/activities" element={<Guard need="catalogue"><Activities /></Guard>} />
        <Route path="/activities/:id" element={<Guard need="catalogue"><ActivityDetail /></Guard>} />
        <Route path="/data-quality" element={<Guard need="catalogue"><DataQuality /></Guard>} />
        <Route path="/categories" element={<Guard need="catalogue"><Categories /></Guard>} />
        <Route path="/events" element={<Guard need="events"><Events /></Guard>} />
        <Route path="/providers" element={<Guard need="owner"><Providers /></Guard>} />
        <Route path="/outreach" element={<Guard need="owner"><Outreach /></Guard>} />
        <Route path="/quality" element={<Guard need="catalogue"><Quality /></Guard>} />
        <Route path="/swipe" element={<Guard need="owner"><SwipeManager /></Guard>} />
        <Route path="/providers/:id" element={<Guard need="owner"><ProviderDetail /></Guard>} />
        <Route path="/analytics" element={<Guard need="owner"><Analytics /></Guard>} />
        <Route path="/funnel" element={<Guard need="owner"><Funnel /></Guard>} />
        <Route path="/errors" element={<Guard need="owner"><Errors /></Guard>} />
        <Route path="/system" element={<Guard need="owner"><System /></Guard>} />
        <Route path="/flags" element={<Guard need="owner"><Flags /></Guard>} />
        <Route path="/audit" element={<Guard need="owner"><AuditLog /></Guard>} />
        <Route path="/sessions" element={<Guard need="owner"><Sessions /></Guard>} />
        <Route path="/vault" element={<Guard need="owner"><Vault /></Guard>} />
        <Route path="/reports" element={<Guard need="support"><Reports /></Guard>} />
        <Route path="/reports/:id" element={<Guard need="support"><ReportDetail /></Guard>} />
        <Route path="/support" element={<Guard need="support"><Support /></Guard>} />
        <Route path="/support/:id" element={<Guard need="support"><SupportTicket /></Guard>} />
        <Route path="/settings" element={<Guard need="owner"><Settings /></Guard>} />
        <Route path="/team" element={<Guard need="team.manage"><Team /></Guard>} />
        <Route
          path="/files"
          element={
            <Guard need="files.read">
              <Suspense fallback={<Loading label="Loading File Manager…" />}>
                <FileManager />
              </Suspense>
            </Guard>
          }
        />
        <Route path="*" element={<Soon title="Not found" />} />
      </Routes>
    </Shell>
  );
}

export function AdminApp() {
  return (
    <AdminAuthProvider>
      <Routes>
        {/* Public (token-protected) landing page of a developer invitation link. */}
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="*" element={<AdminRoutes />} />
      </Routes>
    </AdminAuthProvider>
  );
}

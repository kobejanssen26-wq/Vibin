import { Route, Routes } from "react-router-dom";
import { AdminAuthProvider, useAdminAuth } from "./auth";
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
import { Providers } from "./pages/Providers";
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
  const { stage } = useAdminAuth();

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
        <Route path="/" element={<Dashboard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/:id" element={<UserDetail />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/activities" element={<Activities />} />
        <Route path="/activities/:id" element={<ActivityDetail />} />
        <Route path="/providers" element={<Providers />} />
        <Route path="/providers/:id" element={<ProviderDetail />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/funnel" element={<Funnel />} />
        <Route path="/errors" element={<Errors />} />
        <Route path="/system" element={<System />} />
        <Route path="/flags" element={<Flags />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/vault" element={<Vault />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Soon title="Not found" />} />
      </Routes>
    </Shell>
  );
}

export function AdminApp() {
  return (
    <AdminAuthProvider>
      <AdminRoutes />
    </AdminAuthProvider>
  );
}

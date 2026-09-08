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
        <Route path="/activities" element={<Soon title="Activities" />} />
        <Route path="/activities/:id" element={<Soon title="Activity detail" />} />
        <Route path="/providers" element={<Soon title="Providers" />} />
        <Route path="/providers/:id" element={<Soon title="Provider detail" />} />
        <Route path="/analytics" element={<Soon title="Analytics" />} />
        <Route path="/funnel" element={<Soon title="Funnel & retention" />} />
        <Route path="/errors" element={<Soon title="Errors" />} />
        <Route path="/system" element={<Soon title="System health" />} />
        <Route path="/flags" element={<Soon title="Feature flags" />} />
        <Route path="/audit" element={<Soon title="Audit log" />} />
        <Route path="/sessions" element={<Soon title="Admin sessions" />} />
        <Route path="/vault" element={<Soon title="Credential vault" />} />
        <Route path="/settings" element={<Soon title="Settings" />} />
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

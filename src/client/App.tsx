import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { AppShell } from "./components/AppShell";
import { LoadingScreen } from "./components/ui";
import { LogoMark } from "./components/Logo";

import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { VerifyEmail } from "./pages/VerifyEmail";
import { Dashboard } from "./pages/Dashboard";
import { CreateGroup } from "./pages/CreateGroup";
import { JoinGroup } from "./pages/JoinGroup";
import { GroupConfig } from "./pages/GroupConfig";
import { GroupHome } from "./pages/GroupHome";
import { Swipe } from "./pages/Swipe";
import { DateMatch } from "./pages/DateMatch";
import { PlanView } from "./pages/PlanView";
import { Profile } from "./pages/Profile";
import { Legal } from "./pages/Legal";

// The Owner Command Center is a large, separate tree that normal users never
// load — split it into its own chunk.
const AdminApp = lazy(() =>
  import("./admin/AdminApp").then((m) => ({ default: m.AdminApp })),
);
import { NotFound } from "./pages/NotFound";

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user)
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <AppShell>{children}</AppShell>;
}

function GuestOnly({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

/**
 * Full-screen maintenance notice for normal users. The Command Center
 * (/admin) stays reachable so the owner can turn it back off.
 */
function MaintenanceScreen({ message }: { message: string }) {
  return (
    <div className="grid min-h-full place-items-center bg-paper px-6 text-center">
      <div className="max-w-sm">
        <LogoMark className="mx-auto h-10 w-10" />
        <h1 className="mt-4 text-xl font-extrabold tracking-[-0.02em]">
          Back shortly
        </h1>
        <p className="mt-2 text-sm text-navy-400">
          {message || "VIBIN is briefly down for maintenance."}
        </p>
      </div>
    </div>
  );
}

export function App({ onReady }: { onReady?: () => void }) {
  const { loading } = useAuth();
  const loc = useLocation();
  const [maint, setMaint] = useState<{ on: boolean; message: string } | null>(
    null,
  );

  useEffect(() => {
    if (!loading) onReady?.();
  }, [loading, onReady]);

  useEffect(() => {
    let live = true;
    fetch("/api/status", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: { maintenance?: boolean; message?: string }) => {
        if (live) setMaint({ on: !!d.maintenance, message: d.message ?? "" });
      })
      .catch(() => {
        if (live) setMaint({ on: false, message: "" });
      });
    return () => {
      live = false;
    };
  }, [loc.pathname]);

  if (maint?.on && !loc.pathname.startsWith("/admin")) {
    return <MaintenanceScreen message={maint.message} />;
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/privacy" element={<Legal tab="privacy" />} />
      <Route path="/terms" element={<Legal tab="terms" />} />

      <Route path="/app" element={<Protected><Dashboard /></Protected>} />
      <Route path="/groups/new" element={<Protected><CreateGroup /></Protected>} />
      <Route path="/join/:code" element={<Protected><JoinGroup /></Protected>} />
      <Route path="/groups/:id" element={<Protected><GroupHome /></Protected>} />
      <Route path="/groups/:id/configure" element={<Protected><GroupConfig /></Protected>} />
      <Route path="/groups/:id/swipe" element={<Protected><Swipe /></Protected>} />
      <Route path="/groups/:id/date" element={<Protected><DateMatch /></Protected>} />
      <Route path="/groups/:id/plan" element={<Protected><PlanView /></Protected>} />
      <Route path="/plans/:planId" element={<Protected><PlanView /></Protected>} />
      <Route path="/settings" element={<Protected><Profile /></Protected>} />

      {/* Owner Command Center — its own auth (admin session + MFA), never the
          normal-user gate. Server-side authorization is enforced independently
          on every /api/admin/cc request. */}
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<LoadingScreen />}>
            <AdminApp />
          </Suspense>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

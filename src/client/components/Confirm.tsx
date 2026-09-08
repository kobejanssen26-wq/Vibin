import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./ui";

/**
 * App-wide confirmation dialog — replaces window.confirm so destructive actions
 * get a branded, accessible modal (focus trap, Escape to cancel, backdrop).
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Archive this group?", confirmLabel: "Archive", tone: "danger" })) { … }
 */
interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
}

type Resolver = (ok: boolean) => void;
const Ctx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<Resolver | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setState(o);
      }),
    [],
  );

  const close = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState(null);
  }, []);

  useEffect(() => {
    if (!state) return;
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, close]);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-navy/45 p-4 motion-safe:animate-enter-fade sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onMouseDown={(e) => e.target === e.currentTarget && close(false)}
        >
          <div className="card-raised w-full max-w-sm animate-slide-up p-5">
            <h2 id="confirm-title" className="text-lg font-bold">
              {state.title}
            </h2>
            {state.message && (
              <p className="mt-1.5 text-sm text-navy-500">{state.message}</p>
            )}
            <div className="mt-5 flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => close(false)}
              >
                {state.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                ref={confirmBtn}
                variant={state.tone === "danger" ? "dark" : "primary"}
                className={`flex-1 ${
                  state.tone === "danger" ? "!bg-danger-600 hover:!bg-danger-700" : ""
                }`}
                onClick={() => close(true)}
              >
                {state.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);

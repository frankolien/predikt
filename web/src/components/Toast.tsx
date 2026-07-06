import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, X } from "lucide-react";

/* ============================================================================
   Toast — a transient, self-dismissing snackbar. Monochrome to match the
   chrome: dark pill, white alert glyph (white is our "caution" accent — no red
   in the palette). Fire one with `const notify = useToast(); notify("…")`.
   ============================================================================ */

type ToastItem = { id: number; message: string };

const ToastCtx = createContext<((message: string) => void) | null>(null);

/** Returns a `notify(message)` fn. No-op when rendered outside <ToastProvider>. */
export function useToast() {
  return useContext(ToastCtx) ?? (() => {});
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const notify = useCallback((message: string) => {
    const id = ++seq.current;
    // de-dupe: a repeat of the same message replaces the old one rather than stacking
    setToasts((cur) => [...cur.filter((t) => t.message !== message), { id, message }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 3600);
  }, []);

  return (
    <ToastCtx.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[100] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              role="status"
              className="pointer-events-auto flex max-w-[92vw] items-center gap-2.5 rounded-default border border-edge-2 bg-coal/95 px-3.5 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md"
            >
              <AlertTriangle size={14} className="shrink-0 text-chalk" />
              <span className="font-mono text-[12px] text-silver">{t.message}</span>
              <button
                aria-label="Dismiss"
                onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
                className="ml-1 shrink-0 text-steel transition-colors hover:text-chalk"
              >
                <X size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

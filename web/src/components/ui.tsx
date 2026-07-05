import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useMotionValue, animate, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";
import { flagUrl } from "../lib/flags";

/* ---------------- Button ---------------- */

const button = cva(
  "inline-flex items-center justify-center gap-2 font-mono uppercase tracking-[0.12em] select-none transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none",
  {
    variants: {
      variant: {
        solid: "bg-white text-void hover:-translate-y-px hover:shadow-[0_10px_30px_-12px_rgba(255,255,255,0.35)]",
        outline: "border border-edge-2 text-chalk hover:border-edge-3 hover:bg-white/[0.03]",
        ghost: "text-steel hover:text-chalk",
      },
      size: {
        sm: "px-3 py-1.5 text-[10.5px] rounded-default",
        md: "px-5 py-2.5 text-[11px] rounded-default",
        lg: "px-7 py-3.5 text-[12px] rounded-default",
      },
    },
    defaultVariants: { variant: "solid", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...rest }, ref) => (
    <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...rest} />
  ),
);
Button.displayName = "Button";

/* ---------------- Pill ---------------- */

export function Pill({
  children,
  className,
  strong,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.18em]",
        strong ? "border-edge-3 text-chalk" : "border-edge-2 text-steel",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-2 w-2 items-center justify-center", className)}>
      <span className="absolute h-full w-full rounded-full bg-live/50 [animation:pulse-live_1.3s_ease-in-out_infinite]" />
      <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
    </span>
  );
}

/* Live status chip — green, à la FotMob's live/HT badge. */
export function LivePill({
  minute,
  label = "Live",
  className,
}: {
  minute?: number | string | null;
  label?: string;
  className?: string;
}) {
  const min =
    minute === null || minute === undefined || minute === ""
      ? ""
      : typeof minute === "number"
        ? ` · ${minute}'`
        : ` · ${minute}`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip bg-live-soft px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-live",
        className,
      )}
    >
      <LiveDot />
      {label}
      {min}
    </span>
  );
}

/* Team crest rendered in FULL colour, directly on the surface (no disc). Falls
   back to the 3-letter code chip if the image is missing/broken. */
export function Crest({
  team,
  size = 32,
  className,
}: {
  team: { crest?: string | null; code: string };
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const px = `${size}px`;
  if (team.crest && !failed) {
    return (
      <img
        src={team.crest}
        alt=""
        loading="lazy"
        className={cn("shrink-0 object-contain", className)}
        style={{ height: px, width: px }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-edge-2 bg-panel-2 font-mono font-semibold text-silver",
        className,
      )}
      style={{ height: px, width: px, fontSize: `${Math.round(size * 0.32)}px` }}
    >
      {team.code}
    </span>
  );
}

/* Identity avatar — a unique generated "face" per name/handle (DiceBear), so
   entrants and accounts read at a glance instead of a bland monogram. Falls
   back to initials on a neutral disc if the image can't load (offline-safe). */
const AVATAR_STYLE = "fun-emoji";
export function Avatar({
  seed,
  size = 24,
  className,
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const px = `${size}px`;
  const initials = (seed || "?").replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  if (!failed) {
    const url = `https://api.dicebear.com/9.x/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(seed)}&radius=50`;
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full bg-panel-2 object-cover", className)}
        style={{ height: px, width: px }}
      />
    );
  }
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-edge-2 bg-panel-2 font-mono font-semibold text-silver",
        className,
      )}
      style={{ height: px, width: px, fontSize: `${Math.round(size * 0.34)}px` }}
    >
      {initials}
    </span>
  );
}

/* Country flag for a team code (real flag image, circular à la FotMob). Falls
   back to the 3-letter monogram if the code can't be mapped or the image fails. */
export function Flag({
  code,
  size = 22,
  className,
}: {
  code: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const px = `${size}px`;
  const url = flagUrl(code, 80);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={code}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ height: px, width: px }}
      />
    );
  }
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-edge-2 bg-panel-2 font-mono font-semibold text-silver",
        className,
      )}
      style={{ height: px, width: px, fontSize: `${Math.round(size * 0.3)}px` }}
    >
      {code.slice(0, 3)}
    </span>
  );
}

/* ---------------- Card ---------------- */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-edge bg-panel/60 backdrop-blur-sm", className)}>
      {children}
    </div>
  );
}

/* Corner-bracket frame (registration marks) around content. */
export function Brackets({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const corner = "pointer-events-none absolute h-3 w-3 border-edge-3";
  return (
    <div className={cn("relative", className)}>
      <span className={cn(corner, "left-0 top-0 border-l border-t")} />
      <span className={cn(corner, "right-0 top-0 border-r border-t")} />
      <span className={cn(corner, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(corner, "bottom-0 right-0 border-b border-r")} />
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("label-mono", className)}>{children}</div>;
}

/* ---------------- CountUp ---------------- */

export function CountUp({
  value,
  dp = 2,
  className,
  prefix = "",
  suffix = "",
}: {
  value: number;
  dp?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const format = (n: number) =>
      `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}${suffix}`;
    if (reduce) {
      node.textContent = format(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = format(v);
      },
    });
    return () => controls.stop();
  }, [value, dp, prefix, suffix, mv, reduce]);

  return <span ref={ref} className={className}>{`${prefix}${(0).toFixed(dp)}${suffix}`}</span>;
}

/* ---------------- Reveal ---------------- */

export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

import { ArrowRight, User, Layers, Coins, ShieldCheck, Cpu, Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { TacticsBoard } from "../components/TacticsBoard";
import { Eyebrow, Reveal } from "../components/ui";
import { useApp } from "../context";
import { cn } from "../lib/cn";

const STEPS = [
  { icon: User, t: "Grab a handle", d: "No signup wall. Start with 1,000 points, and connect a self-custodial USD₮ wallet whenever you want real stakes." },
  { icon: Layers, t: "Pick your game", d: "Call a live tie in Predict, run a knockout in Organize, or manage a fantasy XI — same wallet, same table." },
  { icon: ShieldCheck, t: "Your keys, your money", d: "The USD₮ wallet is self-custodial — buy-ins sit in escrow, never with us. Play free in points, or stake real USD₮ any time." },
  { icon: Coins, t: "Settle up", d: "Pots pay out at full time — in points, or on-chain USD₮ with a real tx hash. Then climb the leaderboard." },
];

// ---- desktop app download ----
// The DMG is published as a GitHub Release asset; `latest/download/<asset>`
// always resolves to the newest build of that name. Bump APP_VERSION when the
// bundled version changes so the asset name matches the release.
const REPO_URL = "https://github.com/frankolien/predikt";
const APP_VERSION = "0.1.0";
const DMG_ASSET = `Predikt_${APP_VERSION}_aarch64.dmg`;
const DOWNLOAD_URL = `${REPO_URL}/releases/latest/download/${DMG_ASSET}`;

const isMac =
  typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent) && !/iPhone|iPad|iPod/.test(navigator.userAgent);

/** The Apple mark — standard on a "Download for Mac" button. */
function AppleMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 12.04c-.03-2.9 2.37-4.29 2.48-4.36-1.35-1.98-3.46-2.25-4.21-2.28-1.79-.18-3.5 1.05-4.41 1.05-.91 0-2.31-1.03-3.8-1-.2.03-3.76.44-3.76 4.44 0 2.6 1.9 5.32 3.28 6.98.68.82 1.49 1.74 2.55 1.7 1.02-.04 1.41-.66 2.65-.66 1.24 0 1.59.66 2.67.64 1.1-.02 1.8-.83 2.47-1.65.78-.95 1.1-1.87 1.12-1.92-.02-.01-2.15-.83-2.17-3.28zM14.6 4.6c.56-.68.94-1.62.84-2.56-.81.03-1.79.54-2.37 1.22-.52.6-.98 1.56-.86 2.48.9.07 1.83-.46 2.39-1.14z" />
    </svg>
  );
}

/** A macOS window mock of the actual app — sidebar + the live-green money card. */
function MacWindowMock() {
  const links = ["Hub", "Predict", "Organize", "Fantasy"];
  return (
    <div className="mx-auto w-full max-w-[460px]">
      <div className="overflow-hidden rounded-[16px] border border-edge-2 bg-coal shadow-[0_44px_110px_-34px_rgba(0,0,0,0.85)]">
        {/* title bar */}
        <div className="flex items-center gap-2 border-b border-edge/70 bg-void/60 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Predikt</span>
        </div>
        <div className="flex">
          {/* sidebar */}
          <div className="hidden w-28 shrink-0 flex-col gap-1 border-r border-edge/70 p-3 sm:flex">
            {links.map((l, i) => (
              <div
                key={l}
                className={cn(
                  "flex items-center gap-2 rounded-default px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em]",
                  i === 0 ? "bg-white/[0.05] text-chalk" : "text-steel",
                )}
              >
                <span className={cn("h-1 w-1 rounded-full", i === 0 ? "bg-live shadow-[0_0_6px_var(--color-live)]" : "bg-steel/50")} />
                {l}
              </div>
            ))}
          </div>
          {/* content */}
          <div className="flex-1 p-4">
            <div className="relative overflow-hidden rounded-[12px] border border-live/25 bg-panel/60 p-4">
              <div
                className="pointer-events-none absolute inset-0"
                style={{ backgroundImage: "radial-gradient(120% 120% at 0% 0%, color-mix(in srgb, var(--color-live) 20%, transparent), transparent 60%)" }}
              />
              <div className="relative">
                <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-faint">USD₮ balance</div>
                <div className="mt-1 font-display text-[26px] font-semibold leading-none text-chalk">
                  788.49 <span className="font-mono text-[12px] text-steel">USD₮</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-[8px] bg-live py-2 text-center font-mono text-[8px] uppercase tracking-[0.12em] text-void">Send</div>
                  <div className="rounded-[8px] bg-live py-2 text-center font-mono text-[8px] uppercase tracking-[0.12em] text-void">Receive</div>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-[10px] border border-edge px-3 py-2.5">
              <span className="font-mono text-[9px] text-steel">ARG vs FRA</span>
              <span className="flex items-center gap-1 font-mono text-[9px] text-live">
                <span className="h-1 w-1 rounded-full bg-live" /> LIVE
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const DESKTOP_FEATURES = [
  { icon: Cpu, t: "On-device AI" },
  { icon: Bell, t: "Live goal alerts" },
  { icon: ShieldCheck, t: "Keys in keychain" },
];

export default function Landing() {
  const { health } = useApp();
  const reduce = useReducedMotion();
  const rise = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <div>
      {/* ---- hero: copy + interactive tactics board ---- */}
      <section className="relative overflow-hidden pt-14">
        <div className="grid-lines grid-fade absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-6 py-12 lg:min-h-[86vh] lg:grid-cols-12 lg:gap-10 lg:py-16">
          {/* copy */}
          <div className="lg:col-span-5">
            <motion.div {...rise(0)} className="mb-6 flex items-center gap-3">
              <span className="h-px w-8 bg-edge-3" />
              <span className="label-mono">all-in-one football · world cup 2026</span>
            </motion.div>

            <motion.h1
              {...rise(0.08)}
              className="font-display font-medium tracking-[-0.05em] text-[clamp(46px,8.5vw,92px)] leading-[0.9]"
            >
              <span className="text-gradient block">Call it.</span>
              <span className="text-gradient block">Run it.</span>
              <span className="block text-chalk">Play it.</span>
            </motion.h1>

            <motion.p {...rise(0.18)} className="mt-7 max-w-[46ch] text-[clamp(14px,1.6vw,17px)] leading-relaxed text-silver">
              Predict live ties, run knockout cups and manage a fantasy XI of real World Cup
              players — all under one self-custodial <span className="text-chalk">USD₮ wallet</span>: buy-ins to
              escrow, payouts on-chain to you. Free to play; real money when you want it.
            </motion.p>

            <motion.div {...rise(0.26)} className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/predict"
                className="inline-flex items-center gap-2 rounded-default bg-white px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.12em] text-void transition-transform hover:-translate-y-px"
              >
                Kick off — it's free <ArrowRight size={14} />
              </Link>
              <Link
                to="/app"
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-steel underline-offset-4 hover:text-chalk hover:underline"
              >
                Explore the hub
              </Link>
            </motion.div>

            <motion.p {...rise(0.32)} className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">
              no signup wall · points to start · USD₮ when you want it
            </motion.p>
          </div>

          {/* the board */}
          <motion.div {...rise(0.16)} className="lg:col-span-7">
            <TacticsBoard health={health} />
          </motion.div>
        </div>
      </section>

      {/* ---- how it works ---- */}
      <section id="how" className="scroll-mt-16 border-y border-edge bg-coal/40">
        <div className="mx-auto max-w-[1240px] px-6 py-12">
          <Eyebrow className="mb-6">how it works</Eyebrow>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.t} delay={i * 0.06}>
                <div className="flex flex-col gap-2 border-l border-edge pl-4">
                  <div className="flex items-center gap-2">
                    <s.icon size={15} className="text-chalk" />
                    <span className="font-mono text-[10px] text-ghost">0{i + 1}</span>
                  </div>
                  <div className="font-display text-[18px] font-semibold text-chalk">{s.t}</div>
                  <p className="text-[13px] leading-relaxed text-steel">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- desktop app ---- */}
      <section id="desktop" className="relative scroll-mt-16 overflow-hidden border-t border-edge">
        {/* one corner of live-green — the single accent (per the colour policy) */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "radial-gradient(58% 80% at 90% 2%, color-mix(in srgb, var(--color-live) 9%, transparent), transparent 60%)" }}
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-20">
          {/* copy + CTA */}
          <div>
            <Eyebrow className="mb-5">desktop app · macOS</Eyebrow>
            <h2 className="font-display font-medium tracking-[-0.04em] text-[clamp(30px,4.4vw,50px)] leading-[0.98] text-chalk">
              The whole club,
              <br />
              <span className="text-gradient">native on your Mac.</span>
            </h2>
            <p className="mt-6 max-w-[42ch] text-[clamp(14px,1.5vw,16px)] leading-relaxed text-silver">
              The same Predikt, wrapped as a real macOS app — the Gaffer AI runs{" "}
              <span className="text-chalk">on-device</span>, live goals hit your notifications, and your keys sit in the
              OS keychain. Nothing leaves your machine.
            </p>

            <div className="mt-7 flex flex-wrap gap-2.5">
              {DESKTOP_FEATURES.map((f) => (
                <span
                  key={f.t}
                  className="inline-flex items-center gap-1.5 rounded-chip border border-edge-2 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-steel"
                >
                  <f.icon size={12} className="text-live" /> {f.t}
                </span>
              ))}
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-5">
              <a
                href={DOWNLOAD_URL}
                className="group inline-flex items-center gap-2.5 rounded-default bg-white px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.12em] text-void transition-transform hover:-translate-y-px"
              >
                <AppleMark size={16} /> Download for Mac
              </a>
              <div className="font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.14em] text-faint">
                <div>{isMac ? "Apple Silicon · macOS 11+" : "Requires macOS · Apple Silicon"}</div>
                <div className="text-ghost">
                  v{APP_VERSION} · ~36 MB ·{" "}
                  <a href={`${REPO_URL}/releases`} className="underline-offset-2 hover:text-steel hover:underline">
                    all downloads
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* window mock */}
          <Reveal>
            <MacWindowMock />
          </Reveal>
        </div>
      </section>

      {/* ---- footer ---- */}
      <footer className="border-t border-edge">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-display text-[20px] font-semibold tracking-[-0.03em] text-chalk">Predikt</div>
            <p className="mt-1 max-w-md text-[13px] text-steel">
              The all-in-one football club — predict, organize and play fantasy with your mates, under one
              self-custodial USD₮ wallet. Your keys, your money, real on-chain settlement.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 font-mono text-[11px] text-faint sm:items-end">
            <span>points · free to play</span>
            <span>USD₮ · {health?.chainReady ? "self-custodial (WDK)" : "—"}</span>
            <span className="text-steel">your keys · on-chain payouts · no custody</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

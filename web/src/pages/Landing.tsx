import { ArrowRight, User, Layers, Coins, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { TacticsBoard } from "../components/TacticsBoard";
import { Eyebrow, Reveal } from "../components/ui";
import { useApp } from "../context";

const STEPS = [
  { icon: User, t: "Grab a handle", d: "No signup wall. Start with 1,000 points, and connect a self-custodial USD₮ wallet whenever you want real stakes." },
  { icon: Layers, t: "Pick your game", d: "Call a live tie in Predict, run a knockout in Organize, or manage a fantasy XI — same wallet, same table." },
  { icon: ShieldCheck, t: "Your keys, your money", d: "The USD₮ wallet is self-custodial — buy-ins sit in escrow, never with us. Play free in points, or stake real USD₮ any time." },
  { icon: Coins, t: "Settle up", d: "Pots pay out at full time — in points, or on-chain USD₮ with a real tx hash. Then climb the leaderboard." },
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

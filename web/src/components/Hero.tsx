import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { AsciiBall } from "./AsciiBall";

const PRINCIPLES = [
  ["01", "Free to play", "points, not money"],
  ["02", "Private AI pundit", "the Gaffer · on-device"],
  ["03", "Pools with mates", "join by invite code"],
];

export function Hero() {
  const reduce = useReducedMotion();
  const rise = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <section className="relative min-h-[92vh] overflow-hidden pt-14">
      {/* grid backdrop */}
      <div className="grid-lines grid-fade absolute inset-0" aria-hidden />
      {/* ASCII ball, right side */}
      <div className="pointer-events-none absolute inset-y-0 right-[-8%] hidden w-[58%] items-center lg:flex">
        <AsciiBall className="h-[72%] w-full opacity-90" />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(60% 60% at 60% 50%, transparent 40%, var(--color-void) 92%)" }}
        />
      </div>

      <div className="relative mx-auto flex min-h-[92vh] max-w-[1180px] flex-col justify-center px-6">
        <motion.div {...rise(0)} className="mb-7 flex items-center gap-3">
          <span className="h-px w-8 bg-edge-3" />
          <span className="label-mono">free to play · live world cup 2026</span>
        </motion.div>

        <motion.h1
          {...rise(0.08)}
          className="font-display font-medium tracking-[-0.05em] text-[clamp(52px,11vw,132px)] leading-[0.88]"
        >
          <span className="text-gradient block">Call it.</span>
          <span className="text-gradient block">Pool up.</span>
          <span className="block text-chalk">Beat your mates.</span>
        </motion.h1>

        <motion.p {...rise(0.18)} className="mt-8 max-w-[52ch] text-[clamp(15px,2vw,19px)] leading-relaxed text-silver">
          Free-to-play football prediction pools with your friends — and{" "}
          <span className="text-chalk">the Gaffer</span>, a private AI pundit that reads every tie and{" "}
          <span className="text-chalk">reacts live</span> as the goals go in.
        </motion.p>

        <motion.div {...rise(0.26)} className="mt-9 flex flex-wrap gap-px overflow-hidden rounded-lg border border-edge bg-edge">
          {PRINCIPLES.map(([n, label, sub]) => (
            <div key={n} className="flex min-w-[190px] flex-1 flex-col gap-2 bg-void px-4 py-3.5">
              <span className="label-mono !text-ghost">{n}</span>
              <span className="text-[14px] font-medium text-chalk">{label}</span>
              <span className="label-mono">{sub}</span>
            </div>
          ))}
        </motion.div>

        <motion.div {...rise(0.34)} className="mt-9 flex items-center gap-5">
          <Link
            to="/room"
            className="inline-flex items-center gap-2 rounded-default bg-white px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.12em] text-void transition-transform hover:-translate-y-px"
          >
            Start playing — free <ArrowRight size={14} />
          </Link>
          <a href="#how" className="font-mono text-[11px] uppercase tracking-[0.12em] text-steel underline-offset-4 hover:text-chalk hover:underline">
            How it works
          </a>
        </motion.div>
      </div>
    </section>
  );
}

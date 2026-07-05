import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * A rotating football rendered as a depth-shaded ASCII point cloud — the
 * monochrome, generative hero visual. Pure canvas, grayscale, no colour.
 */
const RAMP = " ·.-:=+*oO#%@"; // brightness ramp (low → high)

export function AsciiBall({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;
    let angle = 0;

    // Ink colour follows the theme (near-white on dark, near-black on light).
    let inkRGB: [number, number, number] = [237, 237, 236];
    const readInk = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--color-chalk").trim();
      const h2 = v.replace("#", "");
      const s = h2.length === 3 ? h2.split("").map((c) => c + c).join("") : h2;
      const n = parseInt(s || "ededec", 16);
      if (!Number.isNaN(n)) inkRGB = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    readInk();
    const themeObs = new MutationObserver(readInk);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // Fibonacci sphere of unit points (with a couple of "seam" great circles to read as a ball).
    const N = 2600;
    const pts: Array<{ x: number; y: number; z: number; seam: number }> = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = golden * i;
      const x = Math.cos(t) * r;
      const z = Math.sin(t) * r;
      // seam factor: darker near two orthogonal great circles → hints at panels
      const seam = Math.min(Math.abs(x), Math.abs(y), Math.abs(z)) < 0.06 ? 0.5 : 1;
      pts.push({ x, y, z, seam });
    }

    const light = (() => {
      const l = { x: 0.35, y: 0.5, z: 0.9 };
      const m = Math.hypot(l.x, l.y, l.z);
      return { x: l.x / m, y: l.y / m, z: l.z / m };
    })();

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      w = rect?.width ?? 520;
      h = rect?.height ?? 520;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.4;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const tilt = 0.42;
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);
      const fontPx = Math.max(7, Math.round(radius / 27));
      ctx.font = `${fontPx}px "JetBrains Mono Variable", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const p of pts) {
        // rotate around Y
        let x = p.x * cosA + p.z * sinA;
        let z = -p.x * sinA + p.z * cosA;
        let y = p.y;
        // tilt around X
        const y2 = y * cosT - z * sinT;
        const z2 = y * sinT + z * cosT;
        y = y2;
        z = z2;

        const bright = Math.max(0, x * light.x + y * light.y + z * light.z) * p.seam;
        const depth = (z + 1) / 2; // 0 back … 1 front
        const idx = Math.min(RAMP.length - 1, Math.floor(bright * (RAMP.length - 1)));
        const ch = RAMP[idx];
        if (ch === " ") continue;

        const alpha = (0.12 + bright * 0.9) * (0.35 + depth * 0.65);
        ctx.fillStyle = `rgba(${inkRGB[0]},${inkRGB[1]},${inkRGB[2]},${Math.min(1, alpha)})`;
        ctx.fillText(ch, cx + x * radius, cy + y * radius);
      }
      angle += 0.0032;
      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    if (reduce) {
      draw();
      cancelAnimationFrame(raf);
    } else {
      draw();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      themeObs.disconnect();
    };
  }, [reduce]);

  return (
    <div className={`pointer-events-none relative ${className}`} aria-hidden>
      <canvas ref={ref} className="h-full w-full" />
    </div>
  );
}

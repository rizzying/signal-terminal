import { useEffect, useRef } from "react";

type Dot = { theta: number; phi: number; r: number };

/** One sphere of teal and white dots, with a pink edge. No library. A reduced-motion preference draws a single frame. */
export function ParticleSphere() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = canvas.getContext("2d"); } catch { return; }
    if (!ctx) return;
    const dots: Dot[] = Array.from({ length: 380 }, () => ({
      theta: Math.random() * Math.PI * 2,
      phi: Math.acos(2 * Math.random() - 1),
      r: 0.42 + Math.random() * 0.58,
    }));
    const motion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: true, addEventListener() {}, removeEventListener() {} };
    let raf = 0;
    const paint = (t: number) => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 2 || h < 2) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.46;
      const R = Math.min(w, h) * 0.34;
      const rot = motion.matches ? 0.7 : t * 0.00022;
      for (const d of dots) {
        const th = d.theta + rot;
        const x3 = Math.sin(d.phi) * Math.cos(th) * d.r;
        const y3 = Math.cos(d.phi) * d.r;
        const z3 = Math.sin(d.phi) * Math.sin(th) * d.r;
        const depth = (z3 + 1) / 2;
        const edge = Math.hypot(x3, y3) > 0.78;
        ctx.globalAlpha = 0.35 + depth * 0.65;
        ctx.fillStyle = edge ? "rgb(250,209,255)" : depth > 0.5 ? "rgb(203,255,252)" : "rgb(0,130,124)";
        ctx.beginPath();
        ctx.arc(cx + x3 * R, cy + y3 * R, 0.8 + depth * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const loop = (t: number) => { paint(t); if (!motion.matches) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const stop = () => { cancelAnimationFrame(raf); paint(0); };
    motion.addEventListener("change", stop);
    return () => { cancelAnimationFrame(raf); motion.removeEventListener("change", stop); };
  }, []);
  return <canvas ref={ref} className="land-sphere" aria-hidden="true" />;
}

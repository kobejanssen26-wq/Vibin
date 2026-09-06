import { useEffect, useRef } from "react";

/** Lightweight canvas confetti — one burst, cleans itself up. No dependency. */
export function Confetti({ fire }: { fire: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fire || !ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);

    const colors = ["#ff2d55", "#ff7a1a", "#8b3dff", "#ffd166", "#06d6a0"];
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const parts = Array.from({ length: 140 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 80,
      y: H / 2 + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 12,
      vy: Math.random() * -14 - 4,
      g: 0.3 + Math.random() * 0.2,
      s: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[(Math.random() * colors.length) | 0]!,
      life: 0,
    }));

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of parts) {
        p.life += 1;
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const alpha = Math.max(0, 1 - p.life / 110);
        if (alpha > 0 && p.y < H + 20) alive = true;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [fire]);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

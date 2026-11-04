import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

export const SLIDES = [
  { src: "/images/kafe.jpg", alt: "Pelanggan memindai QRIS di kafe modern dengan barista tersenyum" },
  { src: "/images/modern.jpg", alt: "Pelanggan pria membayar dengan QRIS di meja kasir kafe" },
  { src: "/images/every.jpg", alt: "Satu QRIS untuk berbagai jenis bisnis: kafe, retail, fashion, hotel, salon" },
  { src: "/images/online.jpg", alt: "Pemilik toko online menerima pembayaran QRIS" },
];

export const HeroSlider = ({ interval = 5000 }) => {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), interval);
    return () => clearInterval(t);
  }, [paused, interval]);
  const go = (d) => setI((x) => (x + d + SLIDES.length) % SLIDES.length);
  return (
    <div data-testid="hero-slider" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      className="group relative aspect-[16/9] w-full overflow-hidden rounded-[1.75rem] bg-[#0B1736] shadow-[0_40px_80px_-30px_rgba(11,23,54,0.55)] ring-1 ring-black/5">
      <AnimatePresence initial={false}>
        <motion.img key={SLIDES[i].src} src={SLIDES[i].src} alt={SLIDES[i].alt} data-testid={`hero-slide-${i}`}
          initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }} className="absolute inset-0 h-full w-full object-cover" />
      </AnimatePresence>
      {[-1, 1].map((d) => (
        <button key={d} type="button" onClick={() => go(d)} aria-label={d < 0 ? "Slide sebelumnya" : "Slide berikutnya"}
          data-testid={`hero-slider-${d < 0 ? "prev" : "next"}-btn`}
          className={`absolute top-1/2 z-10 -translate-y-1/2 ${d < 0 ? "left-3" : "right-3"} flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[#0B1736] opacity-0 backdrop-blur transition-opacity hover:bg-white group-hover:opacity-100`}>
          {d < 0 ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>
      ))}
      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/30 px-2.5 py-1.5 backdrop-blur">
        {SLIDES.map((s, idx) => (
          <button key={s.src} type="button" onClick={() => setI(idx)} aria-label={`Slide ${idx + 1}`} data-testid={`hero-slider-dot-${idx}`}
            className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ${idx === i ? "w-6 bg-white" : "w-1.5 bg-white/50"}`} />
        ))}
      </div>
    </div>
  );
};

import { motion } from "framer-motion";

export const Reveal = ({ children, delay = 0, className = "" }) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-60px" }}
    transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    className={className}
  >
    {children}
  </motion.div>
);

export const SectionHead = ({ eyebrow, title, desc, center = false, light = false }) => (
  <Reveal className={`max-w-3xl ${center ? "mx-auto text-center" : ""}`}>
    {eyebrow && <p className={`eyebrow ${light ? "!text-[#38BDF8]" : ""}`}>{eyebrow}</p>}
    <h2 className={`mt-4 text-3xl font-bold leading-tight tracking-tight md:text-4xl lg:text-5xl ${light ? "text-white" : "text-[#0B1736] dark:text-white"}`}>{title}</h2>
    {desc && <p className={`mt-5 text-base leading-relaxed md:text-lg ${light ? "text-slate-300" : "text-slate-600 dark:text-slate-300"}`}>{desc}</p>}
  </Reveal>
);

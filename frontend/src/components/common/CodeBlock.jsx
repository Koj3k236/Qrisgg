import { Check, Copy } from "lucide-react";
import { useState } from "react";

export const CodeBlock = ({ code, title, testid = "code-block" }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const html = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span style="color:#7dd3fc">$1</span>$2')
    .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span style="color:#86efac">$1</span>')
    .replace(/\b(\d+)\b/g, '<span style="color:#fbbf24">$1</span>')
    .replace(/^(curl|POST|GET|-H|-d)\b/gm, '<span style="color:#c4b5fd">$1</span>');
  return (
    <div data-testid={testid} className="overflow-hidden rounded-2xl border border-white/10 bg-[#081028] shadow-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          {title && <span className="ml-2 font-mono text-xs text-slate-400">{title}</span>}
        </div>
        <button type="button" onClick={copy} data-testid={`${testid}-copy-btn`} aria-label="Salin kode" className="text-slate-400 transition-colors hover:text-white">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-slate-200" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

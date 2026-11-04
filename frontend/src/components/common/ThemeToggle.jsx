import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const getInitial = () => localStorage.getItem("qrisgg-theme") || "light";

export function useThemeMode() {
  const [mode, setMode] = useState(getInitial);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    localStorage.setItem("qrisgg-theme", mode);
  }, [mode]);
  return [mode, setMode];
}

export const ThemeToggle = ({ className = "" }) => {
  const [mode, setMode] = useThemeMode();
  return (
    <button
      type="button"
      data-testid="theme-toggle-btn"
      aria-label="Ganti tema"
      onClick={() => setMode(mode === "dark" ? "light" : "dark")}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/10 ${className}`}
    >
      {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
};

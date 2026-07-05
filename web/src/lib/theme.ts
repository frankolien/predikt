import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

function initial(): Theme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.dataset.theme as Theme | undefined;
    if (attr === "light" || attr === "dark") return attr;
  }
  return "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("gaffer-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}

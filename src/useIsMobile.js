import { useState, useEffect } from "react";

// True when the viewport is at or below `breakpoint` (default 640px). Shared hook
// for responsive layout switches done in JS (this repo styles inline, not via CSS
// media queries). Mirrors the local copies in Dashboard.jsx / CalendarView.jsx.
export default function useIsMobile(breakpoint = 640) {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return isMobile;
}

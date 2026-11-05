import { useEffect, useRef } from "react";

/**
 * Keeps keyboard focus with a control that swaps its buttons as it changes
 * state (ask → confirm → queued). When the button that had focus is taken
 * away (it unmounted), focus moves to the first button left inside `ref`
 * rather than dropping to the page. Nothing moves otherwise: not on mount,
 * not when focus left on purpose (a click or Tab elsewhere), and not when a
 * background refresh changes the control while focus is somewhere else.
 */
export function useFollowFocus<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  const focused = useRef<Element | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onIn = (e: FocusEvent) => {
      focused.current = e.target as Element;
    };
    // Focus moved to something else on the page: forget it. (A button that is
    // removed loses focus with no new target, so that case is kept.)
    const onOut = (e: FocusEvent) => {
      if (e.relatedTarget && !el.contains(e.relatedTarget as Node)) focused.current = null;
    };
    el.addEventListener("focusin", onIn);
    el.addEventListener("focusout", onOut);
    return () => {
      el.removeEventListener("focusin", onIn);
      el.removeEventListener("focusout", onOut);
    };
  }, []);

  // After every render: if the button that had focus is gone and nothing else took it, hand it on.
  useEffect(() => {
    const el = ref.current;
    const last = focused.current;
    if (!el || !last || last.isConnected) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const next = el.querySelector("button");
    focused.current = next;
    next?.focus();
  });

  return ref;
}

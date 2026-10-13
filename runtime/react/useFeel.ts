"use client";
// React hook for Feel bodies. The body lives outside React state: the hook
// writes styles through a ref on every physics frame, so nothing re-renders
// while it moves.
//
//   const { ref, body } = useFeel<HTMLSpanElement>({
//     feel: "heavy", x: 0, target: 0, min: 0, max: 60,
//     render: (el, b) => (el.style.transform = `translateX(${b.x}px)`),
//   });
//   <span ref={ref} onPointerDown={...} />   // or: useFeelDrag(ref, body, { axis: "x" })
import * as React from "react";
import "../feel.js";

type Force = ((x: number, v: number, body: Body) => number) & { rest?: (x: number) => number; kind?: string };
export interface Body {
  x: number; v: number; mass: number; stiffness: number; damping: number; target: number | null;
  to(t: number): Body; kick(v: number): Body; kickTo(x: number): Body; jump(x: number): Body;
  grab(px: number, t?: number): Body; move(px: number, t?: number): Body; release(): Body;
  projected(): number; rest(): number | null;
  onFrame: ((b: Body) => void) | null; onRelease: ((b: Body, projected: number) => void) | null; onSettle: ((b: Body) => void) | null;
  params: { mass: number; stiffness: number; damping: number };
}
interface FeelGlobal {
  Body: new (o: Record<string, unknown>) => Body;
  drag: (el: HTMLElement, b: Body, o?: { axis?: "x" | "y"; scale?: number; onTap?: (e: PointerEvent) => void }) => void;
  words: (t: string) => { params: { mass: number; stiffness: number; damping: number }; magnet: number; friction: number };
  magnets: (o: { stops: number[]; reachFreq?: number; clickFreq?: number; clickRadius?: number }) => Force;
}
declare global { interface Window { Feel: FeelGlobal } }

export interface UseFeelOptions<E extends HTMLElement> {
  feel?: string;
  mass?: number; stiffness?: number; damping?: number;
  x?: number; target?: number | null; min?: number; max?: number;
  forces?: Force[];
  render: (el: E, body: Body) => void;
  onRelease?: (body: Body, projected: number) => void;
  onSettle?: (body: Body) => void;
}

export function useFeel<E extends HTMLElement>(o: UseFeelOptions<E>) {
  const ref = React.useRef<E>(null);
  const latest = React.useRef(o);
  latest.current = o;

  const body = React.useMemo(() => {
    const { render, onRelease, onSettle, ...rest } = o;
    const b = new window.Feel.Body(rest as Record<string, unknown>);
    b.onFrame = (bb) => { if (ref.current) latest.current.render(ref.current, bb); };
    b.onRelease = (bb, p) => latest.current.onRelease?.(bb, p);
    b.onSettle = (bb) => latest.current.onSettle?.(bb);
    return b;
    // The body is created once; change its params with body.params = …
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useLayoutEffect(() => { if (ref.current) o.render(ref.current, body); }, [body]); // first paint at rest
  // New feel words → new physical params, without recreating the body.
  React.useEffect(() => { if (o.feel) body.params = window.Feel.words(o.feel).params; }, [o.feel, body]);

  return { ref, body };
}

export function useFeelDrag<E extends HTMLElement>(ref: React.RefObject<E>, body: Body, o: { axis?: "x" | "y"; onTap?: () => void } = {}) {
  React.useEffect(() => {
    if (!ref.current) return;
    window.Feel.drag(ref.current, body, { axis: o.axis, onTap: o.onTap });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, body]);
}

"use client";

/*
 * Fullscreen viewer for rendered Mermaid SVGs.
 *
 * Mounted as a portal on document.body when a chart is clicked. The same SVG
 * string the inline <Mermaid> just rendered is reused (no second mermaid.render
 * pass), so the lightbox shows pixel-identical output and opens instantly.
 *
 * Gestures handled directly via Pointer Events so the same handlers cover
 * mouse, pen, and touch:
 *   - one pointer → pan (translate)
 *   - two pointers → pinch zoom around the midpoint
 *   - wheel → zoom around cursor (non-passive listener so preventDefault stops
 *     page scroll / browser pinch from fighting us)
 *   - double-tap / double-click → toggle 1x ↔ DOUBLE_TAP_SCALE around the tap
 *
 * Why a single `view` state object: scale, tx, ty are coupled by the
 * zoom-at-cursor formula. Two rapid wheel ticks in the same React tick would
 * each read a stale `scale` if we kept the three as separate states. The
 * functional setView updater always sees the latest committed value.
 *
 * Why transformOrigin: center center: the SVG sits centered in the viewport
 * with flex, so view={1, 0, 0} naturally shows it fit-to-screen and the
 * zoom-at-point math stays simple (offsets are relative to viewport center).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";

const MIN_SCALE = 0.5;
const MAX_SCALE = 10;
const WHEEL_FACTOR = 1.15;
// A "tap" is a quick press-and-release that didn't move. Anything longer or
// further is a drag (pan) and must not seed a double-tap candidate, otherwise
// every pan-start click gets paired with a previous click and double-taps —
// silently resetting scale to 1 when the user was just trying to drag.
const TAP_MAX_MS = 250;
const TAP_MAX_MOVE_PX = 8;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DIST_PX = 24;
const DOUBLE_TAP_SCALE = 2.5;

type View = { scale: number; tx: number; ty: number };
const INITIAL_VIEW: View = { scale: 1, tx: 0, ty: 0 };

const clamp = (v: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, v));

// All lightbox chrome (top bar, buttons, caption) uses inline styles so it
// renders correctly even if Tailwind's content scanner hasn't indexed this
// file's class set yet — an earlier bug had `bg-black/90` missing from the
// generated CSS and the user reported the lightbox looking transparent.
// Sticking to plain inline styles makes the dialog self-contained.

const CHROME_BAR_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 10,
  padding: "12px",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "8px",
  pointerEvents: "none",
};

const CHROME_GROUP_STYLE: CSSProperties = {
  display: "flex",
  gap: "8px",
  pointerEvents: "auto",
};

const CHIP_BASE_STYLE: CSSProperties = {
  padding: "6px 12px",
  borderRadius: "6px",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  background: "rgba(255, 255, 255, 0.12)",
  color: "#ffffff",
  fontSize: "11px",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  fontFamily: "inherit",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
};

const CHIP_STYLE: CSSProperties = CHIP_BASE_STYLE;

const CHIP_BUTTON_STYLE: CSSProperties = {
  ...CHIP_BASE_STYLE,
  cursor: "pointer",
};

const CLOSE_BUTTON_STYLE: CSSProperties = {
  pointerEvents: "auto",
  width: "40px",
  height: "40px",
  borderRadius: "9999px",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  background: "rgba(255, 255, 255, 0.12)",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
};

const CAPTION_WRAP_STYLE: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: "16px",
  zIndex: 10,
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
};

const CAPTION_CHIP_STYLE: CSSProperties = {
  ...CHIP_BASE_STYLE,
  color: "rgba(255, 255, 255, 0.85)",
};

interface MermaidLightboxProps {
  open: boolean;
  onClose: () => void;
  svg: string;
  caption?: string;
}

export function MermaidLightbox({
  open,
  onClose,
  svg,
  caption,
}: MermaidLightboxProps) {
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [isPanning, setIsPanning] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgWrapRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  // Each tracked pointer carries:
  //   x, y           — last seen position (used by the pan delta on move)
  //   startX/Y       — position at pointerdown (used by tap detection on up)
  //   startTime      — pointerdown timestamp (used by tap detection on up)
  //   isTapCandidate — flips to false the first time the pointer drifts more
  //                    than TAP_MAX_MOVE_PX from start, and never flips back.
  //                    A pan that loops back near origin therefore still
  //                    counts as a drag, not a tap. A second concurrent
  //                    pointer also flips this on every existing pointer
  //                    (pinch is never a tap).
  const pointersRef = useRef(
    new Map<
      number,
      {
        x: number;
        y: number;
        startX: number;
        startY: number;
        startTime: number;
        isTapCandidate: boolean;
      }
    >(),
  );
  // Gesture-start snapshot for pinch: ratio is dist/startDist applied to
  // startScale, so rapid pinch events don't compound rounding errors.
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  // Last *tap* (short, stationary press-and-release), not last pointerdown —
  // see the TAP_MAX_* constants. Seeding this on every pointerdown would
  // misclassify pan-starts as taps and let the next pan-start trigger a
  // double-tap reset.
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  // Base SVG dimensions at scale=1 — the fit-to-viewport size computed on
  // open. Subsequent zooms multiply these. Re-measured per `svg` change.
  const baseRef = useRef<{ src: string; w: number; h: number }>({
    src: "",
    w: 0,
    h: 0,
  });

  // Mount-only setup. The component is conditionally rendered in Mermaid.tsx
  // (only mounted while open=true), so there's no per-open reset to do —
  // useState initialisers already produce a fresh `view` / `isPanning` and
  // pointer/pinch/tap refs start empty. We just need to focus the close
  // button so Escape works without a click first.
  //
  // No `mounted` SSR guard either: conditional rendering in the parent
  // (state-driven, default false) guarantees we never reach SSR with this
  // component active, so `document.body` is always defined when createPortal
  // runs. The earlier guard was the reason wheel + size effects fired with
  // null refs on first render and never re-ran.
  useEffect(() => {
    requestAnimationFrame(() => closeBtnRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock background scroll while the lightbox is open so wheel events feed
  // zoom, not the underlying article.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Drive zoom by mutating the <svg>'s width/height attributes rather than
  // wrapping it in a CSS `transform: scale()`. With CSS scale on a composited
  // layer (which `will-change: transform` forces), the browser rasterizes the
  // SVG to a bitmap once and just stretches the bitmap on the GPU — so at
  // even modest zoom levels every line and glyph blurs into pixels. Setting
  // width/height on the SVG element keeps the browser in vector-redraw mode:
  // every frame it re-paints the SVG at the new effective size, so 10× zoom
  // is as crisp as 1×.
  //
  // The base dimensions are computed once per `svg`: viewBox is the
  // authoritative natural size for Mermaid output, fit into 92vw × 85vh so
  // scale=1 means "fit to viewport." Any later scale change just multiplies
  // those base numbers.
  //
  // useLayoutEffect (not useEffect) so the SVG resize and the wrapper's
  // updated translate commit in the same paint. With a regular useEffect the
  // browser would paint the new transform first and then resize on the next
  // frame — visibly shifting the chart before it grows.
  useLayoutEffect(() => {
    if (!open) return;
    const root = svgWrapRef.current?.querySelector("svg");
    if (!root) return;

    if (baseRef.current.src !== svg) {
      const vb = root.viewBox?.baseVal;
      const naturalW =
        (vb && vb.width) || root.width?.baseVal?.value || 600;
      const naturalH =
        (vb && vb.height) || root.height?.baseVal?.value || 400;
      const fit = Math.min(
        (window.innerWidth * 0.92) / naturalW,
        (window.innerHeight * 0.85) / naturalH,
      );
      baseRef.current = { src: svg, w: naturalW * fit, h: naturalH * fit };

      // Clear mermaid's own inline max-width — it pins the SVG to the
      // article-column width and would defeat the resize below.
      root.style.display = "block";
      root.style.maxWidth = "none";
      root.style.maxHeight = "none";
    }

    const { w, h } = baseRef.current;
    if (w && h) {
      root.style.width = `${w * view.scale}px`;
      root.style.height = `${h * view.scale}px`;
    }
  }, [open, svg, view.scale]);

  // Zoom helper. `compute` receives the latest scale and returns the next
  // (pre-clamp) scale; (cx, cy) is the screen point that should stay anchored.
  // All three view fields update inside a single functional setter so rapid
  // events (wheel, pinch) don't read stale scale.
  const zoom = useCallback(
    (compute: (prevScale: number) => number, cx: number, cy: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = cx - (rect.left + rect.width / 2);
      const py = cy - (rect.top + rect.height / 2);
      setView((prev) => {
        const next = clamp(compute(prev.scale));
        if (next === prev.scale) return prev;
        const ratio = next / prev.scale;
        return {
          scale: next,
          tx: px - ratio * (px - prev.tx),
          ty: py - ratio * (py - prev.ty),
        };
      });
    },
    [],
  );

  const reset = useCallback(() => setView(INITIAL_VIEW), []);

  // Wheel listener attached imperatively as non-passive so preventDefault
  // works — React's synthetic onWheel is passive and the browser would scroll
  // / pinch-zoom the page instead of letting us handle the event.
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR;
      zoom((s) => s * factor, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, zoom]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Pointer capture keeps move/up events flowing to this element even
      // when the cursor leaves it mid-drag.
      e.currentTarget.setPointerCapture(e.pointerId);
      // A second concurrent pointer means we're starting a pinch — neither
      // pointer can be a tap from here on, so disqualify everything
      // currently tracked. Without this, releasing one finger immediately
      // after a pinch could fire a double-tap reset.
      if (pointersRef.current.size > 0) {
        for (const [id, p] of pointersRef.current) {
          pointersRef.current.set(id, { ...p, isTapCandidate: false });
        }
      }
      pointersRef.current.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        startTime: performance.now(),
        isTapCandidate: true,
      });
      setIsPanning(true);
      // Double-tap is decided on pointerup, not down — see endPointer.
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ptrs = pointersRef.current;
      const prev = ptrs.get(e.pointerId);
      if (!prev) return;

      if (ptrs.size === 1) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        // Sticky tap-candidate flag: any drift past TAP_MAX_MOVE_PX from
        // the original pointerdown disqualifies this pointer from being a
        // tap, and the flag never recovers — so a pan that loops back to
        // near origin still counts as a drag.
        const moveFromStart = Math.hypot(
          e.clientX - prev.startX,
          e.clientY - prev.startY,
        );
        const isTapCandidate =
          prev.isTapCandidate && moveFromStart <= TAP_MAX_MOVE_PX;
        ptrs.set(e.pointerId, {
          ...prev,
          x: e.clientX,
          y: e.clientY,
          isTapCandidate,
        });
        setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
        return;
      }

      if (ptrs.size === 2) {
        // Pinch in progress — this pointer is definitively not a tap.
        ptrs.set(e.pointerId, {
          ...prev,
          x: e.clientX,
          y: e.clientY,
          isTapCandidate: false,
        });
        const [a, b] = [...ptrs.values()];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        if (!pinchRef.current) {
          // Capture the starting state once both pointers are down — the
          // first move with two pointers seeds the gesture.
          setView((v) => {
            pinchRef.current = { dist, scale: v.scale };
            return v;
          });
        } else {
          const target = pinchRef.current.scale * (dist / pinchRef.current.dist);
          zoom(() => target, midX, midY);
        }
      }
    },
    [zoom],
  );

  const endPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const ptr = pointersRef.current.get(e.pointerId);
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) setIsPanning(false);

    if (!ptr) return;

    // Classify this gesture: was it a tap (short press-and-release that never
    // drifted past TAP_MAX_MOVE_PX from start) or a drag? `isTapCandidate`
    // is sticky-false set in pointermove the first time the pointer strays,
    // so a pan that wandered and came back is correctly classified as a
    // drag rather than a tap. Pinch (size===2 branch) also flips it off.
    const dt = performance.now() - ptr.startTime;
    const wasTap = ptr.isTapCandidate && dt <= TAP_MAX_MS;
    if (!wasTap) return;

    // Tap confirmed. Check for double-tap by comparing against the previous
    // confirmed tap (not the previous pointerdown).
    const now = performance.now();
    const last = lastTapRef.current;
    const isDoubleTap =
      last &&
      now - last.t < DOUBLE_TAP_MS &&
      Math.abs(e.clientX - last.x) < DOUBLE_TAP_DIST_PX &&
      Math.abs(e.clientY - last.y) < DOUBLE_TAP_DIST_PX;

    if (isDoubleTap) {
      lastTapRef.current = null;
      setView((prev) =>
        prev.scale > 1.01
          ? INITIAL_VIEW
          : zoomToAround(
              prev,
              DOUBLE_TAP_SCALE,
              e.clientX,
              e.clientY,
              containerRef.current,
            ),
      );
    } else {
      lastTapRef.current = { t: now, x: e.clientX, y: e.clientY };
    }
  }, []);

  if (!open) return null;

  return createPortal(
    // Inline styles for the dialog shell so the dark backdrop, layering, and
    // fullscreen positioning render even if Tailwind's JIT hasn't picked up
    // this file's class set yet (it had not, hence an earlier near-transparent
    // lightbox bug). Tailwind utilities are kept for the chrome elements below
    // where partial styling failure is non-critical.
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chart viewer"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "rgba(0, 0, 0, 0.92)",
      }}
    >
      {/* Top chrome bar — inline-styled for the same reason as the dialog
          shell (Tailwind JIT may not have indexed this file). Solid bg color
          on each chip so they always read as a button regardless of how
          opaque the backdrop renders. */}
      <div style={CHROME_BAR_STYLE}>
        <div style={CHROME_GROUP_STYLE}>
          <button type="button" onClick={reset} style={CHIP_BUTTON_STYLE}>
            Reset
          </button>
          <div style={{ ...CHIP_STYLE, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(view.scale * 100)}%
          </div>
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={CLOSE_BUTTON_STYLE}
        >
          <XIcon style={{ width: 20, height: 20 }} />
        </button>
      </div>

      <div
        ref={containerRef}
        className="select-none touch-none"
        style={{
          flex: "1 1 0%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          cursor: isPanning ? "grabbing" : "grab",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {/* Pan-only transform. The SVG itself is resized inline (see the
            zoom effect above) so vector quality is preserved at every scale
            — CSS `scale()` here would force GPU bitmap stretching, which is
            what produced the pixelated chart at high zoom. */}
        <div
          ref={svgWrapRef}
          data-mermaid-lightbox=""
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px)`,
            lineHeight: 0,
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {caption ? (
        <div style={CAPTION_WRAP_STYLE}>
          <div style={CAPTION_CHIP_STYLE}>{caption}</div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

// Pure helper used by the double-tap path so we can update view in a single
// setView call (instead of going through `zoom()` which reads its own ref).
function zoomToAround(
  prev: View,
  target: number,
  cx: number,
  cy: number,
  el: HTMLDivElement | null,
): View {
  if (!el) return prev;
  const rect = el.getBoundingClientRect();
  const px = cx - (rect.left + rect.width / 2);
  const py = cy - (rect.top + rect.height / 2);
  const next = clamp(target);
  const ratio = next / prev.scale;
  return {
    scale: next,
    tx: px - ratio * (px - prev.tx),
    ty: py - ratio * (py - prev.ty),
  };
}

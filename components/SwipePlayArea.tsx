import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'motion/react';
import { CardData, cardHasFlipBack } from '@/src/types';
import { categoryPastelAt } from '@/src/lib/categoryPastels';
import { ZoomIn } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const CARD_IMAGE_BLEED_CLASS = 'origin-center scale-x-[1.05] scale-y-[1.11]';
const CARD_IMAGE_BLEED_LANDSCAPE_CLASS = 'origin-center scale-x-[1.155] scale-y-[1.11]';

export type SwipeSide = 'left' | 'right' | 'up' | 'down';

/** Maps screen edges to category labels for 2–4 categories. */
export function categorySwipeDirections(categories: string[]): Record<SwipeSide, string | null> {
  const n = categories.length;
  if (n <= 0) {
    return { left: null, right: null, up: null, down: null };
  }
  if (n === 1) {
    return { left: categories[0], right: null, up: null, down: null };
  }
  if (n === 2) {
    return { left: categories[0], right: categories[1], up: null, down: null };
  }
  if (n === 3) {
    return { left: categories[0], right: categories[1], up: categories[2], down: null };
  }
  return {
    left: categories[0],
    right: categories[1],
    up: categories[2],
    down: categories[3],
  };
}

/** Horizontal commits require drag further toward screen edges than vertical. */
const THRESH_X = 0.3;
const THRESH_Y = 0.17;

function resolveSwipeTarget(
  dx: number,
  dy: number,
  vw: number,
  vh: number,
  n: number
): SwipeSide | null {
  const px = dx / Math.max(1, vw);
  const py = dy / Math.max(1, vh);
  const absPx = Math.abs(px);
  const absPy = Math.abs(py);

  if (n === 1) {
    if (absPx > THRESH_X || absPy > THRESH_Y) return 'left';
    return null;
  }

  if (n <= 2) {
    if (absPx > THRESH_X && absPx >= absPy) return px < 0 ? 'left' : 'right';
    return null;
  }
  if (n === 3) {
    if (py < -THRESH_Y && absPy >= absPx) return 'up';
    if (absPx > THRESH_X && absPx >= absPy) return px < 0 ? 'left' : 'right';
    return null;
  }
  if (absPx >= absPy) {
    if (absPx > THRESH_X) return px < 0 ? 'left' : 'right';
  } else {
    if (absPy > THRESH_Y) return py < 0 ? 'up' : 'down';
  }
  return null;
}

function overlayOpacity(axis: 'x' | 'y', sign: -1 | 1, dx: number, dy: number, vw: number, vh: number): number {
  const px = dx / Math.max(1, vw);
  const py = dy / Math.max(1, vh);
  let v = 0;
  if (axis === 'x') v = sign * px;
  else v = sign * py;
  if (v <= 0) return 0;
  /** Horizontal preview ramps a bit slower so tint stays subtle until near the edge. */
  const gain = axis === 'x' ? 1.85 : 2.2;
  return Math.min(0.98, v * gain);
}

/** Subtle drag tilt (deg): follows offset direction and gains a bit from pointer velocity. */
function computeSwipeDragTilt(
  dx: number,
  dy: number,
  vx: number,
  vy: number,
  vw: number,
  vh: number
): number {
  const w = Math.max(vw, 1);
  const h = Math.max(vh, 1);
  const maxDeg = 8.5;
  const positionTilt = (dx / w) * maxDeg * 0.92 + (-dy / h) * maxDeg * 0.34;
  const speed = Math.hypot(vx, vy);
  const speedNorm = Math.min(speed / 650, 1);
  const velocityTilt = (vx / 900 - vy / 1200) * maxDeg * 0.32 * speedNorm;
  const combined = positionTilt + velocityTilt;
  return Math.max(-maxDeg, Math.min(maxDeg, combined));
}

type SwipeCardFaceProps = {
  card: CardData;
  isFlipped: boolean;
  className?: string;
  /** Background stack cards: no flip/zoom/dialog. */
  previewOnly?: boolean;
};

function SwipeCardFace({ card, isFlipped, className = '', previewOnly = false }: SwipeCardFaceProps) {
  const canFlip = cardHasFlipBack(card);
  const showBack = canFlip && isFlipped;

  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [frontImgOrient, setFrontImgOrient] = useState<'landscape' | 'portrait' | null>(null);
  const [backImgOrient, setBackImgOrient] = useState<'landscape' | 'portrait' | null>(null);
  const visibleImageUrl = (showBack ? card.backImage : card.frontImage)?.trim() || '';
  const canZoom = visibleImageUrl.length > 0;

  const onFaceImgLoad =
    (side: 'front' | 'back') => (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
      if (w <= 0 || h <= 0) return;
      const o = w > h ? 'landscape' : 'portrait';
      if (side === 'front') setFrontImgOrient(o);
      else setBackImgOrient(o);
    };

  const flipTransition = { duration: 0.38, ease: [0.4, 0, 0.2, 1] as const };

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <div className={`relative h-[12rem] w-[15.6rem] shrink-0 [perspective:1000px] ${className}`}>
        <div className="relative h-full w-full overflow-visible rounded-3xl shadow-[0_4px_28px_rgba(15,23,42,0.14)]">
          <motion.div
            aria-hidden={showBack}
            className="absolute inset-0 flex flex-col justify-end items-start overflow-visible border-2 border-emerald-100 bg-white rounded-3xl p-2.5"
            initial={false}
            animate={{
              opacity: showBack ? 0 : 1,
              rotateY: showBack ? 88 : 0,
              zIndex: showBack ? 0 : 1,
            }}
            transition={flipTransition}
            style={{
              transformOrigin: 'center center',
              pointerEvents: showBack ? 'none' : 'auto',
            }}
          >
            {card.frontImage && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                <div className="relative flex h-full min-h-0 w-full items-center justify-center p-2.5">
                  <img
                    src={card.frontImage}
                    alt=""
                    className={
                      frontImgOrient === 'landscape'
                        ? `h-full w-full min-h-0 object-cover object-center ${CARD_IMAGE_BLEED_LANDSCAPE_CLASS}`
                        : `max-h-full max-w-full object-contain ${CARD_IMAGE_BLEED_CLASS}`
                    }
                    referrerPolicy="no-referrer"
                    onLoad={onFaceImgLoad('front')}
                  />
                  <div className="pointer-events-none absolute inset-0 rounded-3xl bg-black/20" />
                </div>
              </div>
            )}
            <div className="relative z-10 min-w-0 max-w-full rounded-md bg-white/80 px-2 py-1 text-left text-base font-medium break-words text-slate-800 drop-shadow-sm">
              {card.frontText}
            </div>
          </motion.div>

          {canFlip ? (
            <motion.div
              aria-hidden={!showBack}
              className="absolute inset-0 flex flex-col justify-end items-start overflow-visible rounded-3xl border-2 border-amber-200 bg-amber-50 p-2.5"
              initial={false}
              animate={{
                opacity: showBack ? 1 : 0,
                rotateY: showBack ? 0 : -88,
                zIndex: showBack ? 1 : 0,
              }}
              transition={flipTransition}
              style={{
                transformOrigin: 'center center',
                pointerEvents: showBack ? 'auto' : 'none',
              }}
            >
              {card.backImage && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                  <div className="relative flex h-full min-h-0 w-full items-center justify-center p-2.5">
                    <img
                      src={card.backImage}
                      alt=""
                      className={
                        backImgOrient === 'landscape'
                          ? `h-full w-full min-h-0 object-cover object-center ${CARD_IMAGE_BLEED_LANDSCAPE_CLASS}`
                          : `max-h-full max-w-full object-contain ${CARD_IMAGE_BLEED_CLASS}`
                      }
                      referrerPolicy="no-referrer"
                      onLoad={onFaceImgLoad('back')}
                    />
                    <div className="pointer-events-none absolute inset-0 rounded-3xl bg-black/20" />
                  </div>
                </div>
              )}
              <div className="relative z-10 min-w-0 max-w-full rounded-md bg-white/80 px-2 py-1 text-left text-base font-medium break-words text-slate-800 drop-shadow-sm">
                {card.backText || 'No back text'}
              </div>
            </motion.div>
          ) : null}

          {!previewOnly && canZoom ? (
            <button
              type="button"
              aria-label="View full size image"
              data-swipe-no-flip
              className="absolute top-1 right-1 z-30 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-transparent text-slate-800"
              onPointerDown={stop}
              onClick={(e) => {
                stop(e);
                setZoomUrl(visibleImageUrl);
              }}
            >
              <ZoomIn
                className="h-4 w-4 [filter:drop-shadow(0_0_1px_rgba(255,255,255,0.98))_drop-shadow(0_0_2px_rgba(255,255,255,0.85))]"
                strokeWidth={2.25}
              />
            </button>
          ) : null}
        </div>
      </div>

      {!previewOnly ? (
      <Dialog open={zoomUrl != null} onOpenChange={(open) => !open && setZoomUrl(null)}>
        <DialogContent
          showCloseButton
          closeButtonClassName="text-white hover:bg-white/15 max-sm:top-[max(0.5rem,env(safe-area-inset-top))] max-sm:right-[max(0.5rem,env(safe-area-inset-right))]"
          closeIconClassName="max-sm:size-5 max-sm:text-slate-900 max-sm:[stroke-width:2.75] max-sm:stroke-white max-sm:[paint-order:stroke_fill] sm:text-white"
          className="left-0 right-0 mx-auto w-full max-w-none translate-x-0 gap-0 overflow-y-auto border-transparent bg-black p-0 ring-0 ring-transparent max-sm:top-1/2 max-sm:max-h-[100dvh] max-sm:-translate-y-1/2 max-sm:rounded-none max-sm:shadow-lg sm:left-1/2 sm:right-auto sm:max-h-[92vh] sm:w-auto sm:max-w-[min(95vw,1200px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-3 sm:ring-1 sm:ring-white/20"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Full size image</DialogTitle>
            <DialogDescription>Expanded card image preview</DialogDescription>
          </DialogHeader>
          {zoomUrl ? (
            <img
              src={zoomUrl}
              alt=""
              className="mx-auto block w-full max-w-full object-contain max-sm:max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] max-sm:rounded-none sm:max-h-[85vh] sm:w-auto sm:rounded-md"
              referrerPolicy="no-referrer"
            />
          ) : null}
        </DialogContent>
      </Dialog>
      ) : null}
    </>
  );
}

export type SwipePlayAreaProps = {
  categories: string[];
  deckCards: CardData[];
  flippedCards: Record<string, boolean>;
  onFlip: (id: string) => void;
  onPlaceCard: (cardId: string, category: string) => void;
};

export function SwipePlayArea({ categories, deckCards, flippedCards, onFlip, onPlaceCard }: SwipePlayAreaProps) {
  const dirMap = useMemo(() => categorySwipeDirections(categories), [categories]);
  const n = categories.length;

  const swipePastel = (catName: string | null) => {
    if (!catName) return categoryPastelAt(0);
    const i = categories.indexOf(catName);
    return categoryPastelAt(i >= 0 ? i : 0);
  };

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragVelocityRef = useRef({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ w: 320, h: 568 });
  const containerRef = useRef<HTMLDivElement>(null);
  /** Exit flight direction when a card is committed (read during AnimatePresence exit). */
  const flyOutRef = useRef({ x: 0, y: 0 });
  /** Bumps when drag ends without a sort so the top card remounts centered (snap-back). */
  const [snapKey, setSnapKey] = useState(0);

  const top = deckCards[0];
  const second = deckCards[1];
  const third = deckCards[2];

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = () => {
      const rect = el.getBoundingClientRect();
      setViewport({ w: rect.width, h: rect.height });
    };
    r();
    const ro = new ResizeObserver(r);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setSnapKey(0);
  }, [top?.id]);

  const previewSide = useMemo(() => {
    return resolveSwipeTarget(dragOffset.x, dragOffset.y, viewport.w, viewport.h, n);
  }, [dragOffset.x, dragOffset.y, viewport.w, viewport.h, n]);

  const leftOp = dirMap.left ? overlayOpacity('x', -1, dragOffset.x, dragOffset.y, viewport.w, viewport.h) : 0;
  const rightOp = dirMap.right ? overlayOpacity('x', 1, dragOffset.x, dragOffset.y, viewport.w, viewport.h) : 0;
  const upOp = dirMap.up ? overlayOpacity('y', -1, dragOffset.x, dragOffset.y, viewport.w, viewport.h) : 0;
  const downOp = dirMap.down ? overlayOpacity('y', 1, dragOffset.x, dragOffset.y, viewport.w, viewport.h) : 0;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const side = resolveSwipeTarget(info.offset.x, info.offset.y, viewport.w, viewport.h, n);
    const cat = side ? dirMap[side] : null;
    if (top && cat) {
      const { x, y } = info.offset;
      const m = Math.max(Math.abs(x), Math.abs(y), 1);
      flyOutRef.current = { x: (x / m) * 440, y: (y / m) * 520 };
      onPlaceCard(top.id, cat);
    } else {
      flyOutRef.current = { x: 0, y: 0 };
      if (top) setSnapKey((k) => k + 1);
    }
    dragVelocityRef.current = { x: 0, y: 0 };
    setDragOffset({ x: 0, y: 0 });
  };

  const dragTiltDeg = computeSwipeDragTilt(
    dragOffset.x,
    dragOffset.y,
    dragVelocityRef.current.x,
    dragVelocityRef.current.y,
    viewport.w,
    viewport.h
  );

  if (!top) {
    return (
      <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center text-slate-500">
        <p className="text-center text-lg font-medium">All cards sorted!</p>
      </div>
    );
  }

  const labelMinOp = (side: SwipeSide, base: number) =>
    previewSide === side ? Math.max(base, 0.88) : base;

  /** Label text stays readable: higher floor + stronger when that edge is active. */
  const labelTextOpacity = (side: SwipeSide, edgeOpacity: number) => {
    const boosted = labelMinOp(side, Math.max(edgeOpacity, 0.58));
    return Math.min(1, boosted * 1.08);
  };

  return (
    <div ref={containerRef} className="relative flex min-h-0 min-w-0 flex-1 touch-none flex-col overflow-hidden">
      {/* Pastel edge tints (below cards) — narrow side bands keep commits near screen edges */}
      {dirMap.left ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-[15] w-[24%]"
          style={{
            backgroundColor: swipePastel(dirMap.left).swipeTint,
            opacity: labelMinOp('left', leftOp),
          }}
        />
      ) : null}
      {dirMap.right ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-[15] w-[24%]"
          style={{
            backgroundColor: swipePastel(dirMap.right).swipeTint,
            opacity: labelMinOp('right', rightOp),
          }}
        />
      ) : null}
      {dirMap.up ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[15] h-[32%]"
          style={{
            backgroundColor: swipePastel(dirMap.up).swipeTint,
            opacity: labelMinOp('up', upOp),
          }}
        />
      ) : null}
      {dirMap.down ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] h-[32%]"
          style={{
            backgroundColor: swipePastel(dirMap.down).swipeTint,
            opacity: labelMinOp('down', downOp),
          }}
        />
      ) : null}

      {/* Category labels always above cards */}
      {dirMap.left ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[60] flex w-[24%] items-center justify-start ps-1 pe-2">
          <p
            className={`max-w-[min(100%,6.5rem)] text-center text-lg font-bold leading-tight tracking-tight drop-shadow-[0_1px_2px_rgb(255_255_255/0.95)] [text-shadow:0_0_14px_rgb(255_255_255/0.9)] [writing-mode:vertical-rl] rotate-180 sm:[writing-mode:horizontal-tb] sm:rotate-0 ${swipePastel(dirMap.left).titleClass}`}
            style={{ opacity: labelTextOpacity('left', leftOp) }}
          >
            {dirMap.left}
          </p>
        </div>
      ) : null}
      {dirMap.right ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-[60] flex w-[24%] items-center justify-end ps-2 pe-1">
          <p
            className={`max-w-[min(100%,6.5rem)] text-center text-lg font-bold leading-tight drop-shadow-[0_1px_2px_rgb(255_255_255/0.95)] [text-shadow:0_0_14px_rgb(255_255_255/0.9)] [writing-mode:vertical-rl] sm:[writing-mode:horizontal-tb] ${swipePastel(dirMap.right).titleClass}`}
            style={{ opacity: labelTextOpacity('right', rightOp) }}
          >
            {dirMap.right}
          </p>
        </div>
      ) : null}
      {dirMap.up ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[60] flex h-[32%] items-start justify-center px-2 pt-1">
          <p
            className={`max-w-[min(100%,16rem)] text-center text-lg font-bold leading-tight drop-shadow-[0_1px_2px_rgb(255_255_255/0.95)] [text-shadow:0_0_14px_rgb(255_255_255/0.9)] ${swipePastel(dirMap.up).titleClass}`}
            style={{ opacity: labelTextOpacity('up', upOp) }}
          >
            {dirMap.up}
          </p>
        </div>
      ) : null}
      {dirMap.down ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[60] flex h-[32%] items-end justify-center px-2 pb-1">
          <p
            className={`max-w-[min(100%,16rem)] text-center text-lg font-bold leading-tight drop-shadow-[0_1px_2px_rgb(255_255_255/0.95)] [text-shadow:0_0_14px_rgb(255_255_255/0.9)] ${swipePastel(dirMap.down).titleClass}`}
            style={{ opacity: labelTextOpacity('down', downOp) }}
          >
            {dirMap.down}
          </p>
        </div>
      ) : null}

      <div className="relative z-50 flex flex-1 items-center justify-center px-4 py-6">
        <div className="relative flex h-[14rem] w-[18rem] items-center justify-center">
          {third ? (
            <motion.div
              key={third.id + '-3'}
              className="pointer-events-none absolute"
              initial={false}
              animate={{
                scale: 0.88,
                y: 18,
                opacity: 0.55,
                rotate: -3,
              }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              <div className="opacity-90">
                <SwipeCardFace card={third} isFlipped={!!flippedCards[third.id]} previewOnly />
              </div>
            </motion.div>
          ) : null}
          {second ? (
            <motion.div
              key={second.id + '-2'}
              className="pointer-events-none absolute"
              initial={false}
              animate={{
                scale: 0.93,
                y: 10,
                opacity: 0.72,
                rotate: 1.5,
              }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              <div className="opacity-95">
                <SwipeCardFace card={second} isFlipped={!!flippedCards[second.id]} previewOnly />
              </div>
            </motion.div>
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={top.id}
              initial={{ scale: 0.96, opacity: 0.85 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={() => {
                const { x, y } = flyOutRef.current;
                return {
                  x,
                  y,
                  opacity: 0,
                  scale: 0.88,
                  rotate: x > 20 ? 8 : x < -20 ? -8 : 0,
                  transition: { duration: 0.22, ease: 'easeOut' },
                };
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute"
            >
              {/* Inner key: remount on failed sort = snap to center without exit animation */}
              <motion.div
                key={snapKey}
                drag
                dragConstraints={{ left: -280, right: 280, top: -300, bottom: 300 }}
                dragElastic={0.12}
                onDrag={(_, info) => {
                  dragVelocityRef.current = { x: info.velocity.x, y: info.velocity.y };
                  setDragOffset({ x: info.offset.x, y: info.offset.y });
                }}
                onDragEnd={handleDragEnd}
                onTap={(e) => {
                  if (!cardHasFlipBack(top)) return;
                  const el = e.target as HTMLElement | null;
                  if (el?.closest?.('[data-swipe-no-flip]')) return;
                  onFlip(top.id);
                }}
                initial={{ x: 0, y: 0, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                style={{
                  rotate: dragTiltDeg,
                  transformOrigin: 'center center',
                }}
                className="cursor-grab touch-none active:cursor-grabbing"
              >
                <SwipeCardFace card={top} isFlipped={!!flippedCards[top.id]} />
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <p className="pointer-events-none pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] text-center text-xs text-slate-500">
        Drag the card toward a category. Release to sort.
      </p>
    </div>
  );
}

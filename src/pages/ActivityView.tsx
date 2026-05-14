import React, { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useParams } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, getDocs, addDoc, collection, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { Activity, CardData, cardHasFlipBack } from '../types';
import {
  computeClassPlacementByCard,
  isScoredSort,
  type CardPlacementBreakdownRow,
} from '../lib/classPlacementBreakdown';
import { ClassPlacementBreakdownList } from '@/components/ClassPlacementBreakdownList';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RotateCcw, RotateCw, CheckCircle2, ZoomIn, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { SwipePlayArea } from '@/components/SwipePlayArea';
import { categoryPastelAt } from '@/src/lib/categoryPastels';

/** Card size: w-48 h-36 + gap-4 — max 3 cards per column before wrapping. */
const CARD_W = '12rem';
const CARD_H = '9rem';
const CARD_GAP = '1rem';
const MAX_CARDS_PER_COLUMN = 3;
const COLUMN_WRAP_HEIGHT = `calc(${MAX_CARDS_PER_COLUMN} * ${CARD_H} + ${MAX_CARDS_PER_COLUMN - 1} * ${CARD_GAP})`;

/** ActivityShell play background; frost layer uses a similar strength. */
const BG_IMAGE_OPACITY = 0.28;

/** After object-contain layout, scale so the image peeks slightly past the card border (vertical emphasis). */
const CARD_IMAGE_BLEED_CLASS = 'origin-center scale-x-[1.05] scale-y-[1.11]';
/** Landscape `object-cover`: +10% horizontal scale so side edges reach the card frame (1.05 × 1.1). */
const CARD_IMAGE_BLEED_LANDSCAPE_CLASS = 'origin-center scale-x-[1.155] scale-y-[1.11]';

/** Below Tailwind `sm` (640px): compact deck carousel + submit beside deck label. */
const NARROW_PLAY_LAYOUT_MQ = '(max-width: 639.98px)';

function useNarrowPlayLayout(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_PLAY_LAYOUT_MQ).matches
  );
  useLayoutEffect(() => {
    const mq = window.matchMedia(NARROW_PLAY_LAYOUT_MQ);
    setNarrow(mq.matches);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

function categoryShellMinWidth(placedCount: number): string {
  const cols = Math.max(1, Math.ceil(Math.max(0, placedCount) / MAX_CARDS_PER_COLUMN));
  if (cols <= 1) return `calc(${CARD_W} + 2rem)`; // one column + p-4 horizontal
  return `calc(${cols} * ${CARD_W} + ${cols - 1} * ${CARD_GAP} + 2rem)`;
}

function colsMinWidthInner(placedCount: number): string {
  const cols = Math.max(1, Math.ceil(Math.max(0, placedCount) / MAX_CARDS_PER_COLUMN));
  if (cols <= 1) return CARD_W;
  return `calc(${cols} * ${CARD_W} + ${cols - 1} * ${CARD_GAP})`;
}

/** Flex column-wrap height: only as tall as needed for current cards; grows when more cards force extra rows/columns. */
function categoryCardsFlexHeight(placedCount: number): string {
  if (placedCount <= 0) return '7rem';
  const cols = Math.max(1, Math.ceil(placedCount / MAX_CARDS_PER_COLUMN));
  const maxInCol = Math.ceil(placedCount / cols);
  if (maxInCol <= 1) return CARD_H;
  return `calc(${maxInCol} * ${CARD_H} + ${maxInCol - 1} * ${CARD_GAP})`;
}

const DroppableCategory: React.FC<{
  id: string;
  title: string;
  children: React.ReactNode;
  isOver: boolean;
  className?: string;
  /** Categories use max 3 cards per column and min-width from column count; deck is a loose drop zone. */
  layout?: 'category' | 'deck';
  /** Cards currently in this category (drives width / wrap columns). */
  placedCount?: number;
  /** Drives pastel border/title; omit for deck. */
  categoryColorIndex?: number;
  /** Activity background URL — with `viewportFixedGlass`, draws a fixed-attached blur under the tint (real backdrop-filter cannot see the shell fixed bg through overflow/transform). */
  playBackgroundImage?: string;
  /** Wide / web layout: stack fixed-position blur + translucent tint so the page background reads through. */
  viewportFixedGlass?: boolean;
}> = ({
  id,
  title,
  children,
  isOver,
  className = '',
  layout = 'category',
  placedCount = 0,
  categoryColorIndex,
  playBackgroundImage,
  viewportFixedGlass = false,
}) => {
  const { setNodeRef } = useDroppable({ id });
  const pastel = categoryColorIndex != null ? categoryPastelAt(categoryColorIndex) : null;
  const frostUrl = playBackgroundImage?.trim();
  const useFrostStack = pastel != null && !!frostUrl && viewportFixedGlass;
  const borderColor = pastel ? (isOver ? pastel.borderOver : pastel.border) : undefined;
  const panelFill = pastel ? (isOver ? pastel.panelBgOver : pastel.panelBg) : undefined;

  const shell = pastel
    ? `${useFrostStack ? 'relative overflow-hidden ' : ''}rounded-3xl border-2 border-solid transition-colors ${
        useFrostStack
          ? 'max-sm:backdrop-blur-md'
          : 'max-sm:backdrop-blur-md sm:backdrop-blur-xl sm:backdrop-saturate-150 overflow-visible'
      } ${className}`
    : `rounded-3xl border-2 transition-colors ${
        isOver
          ? 'border-emerald-400 bg-emerald-50/50'
          : 'border-slate-200 bg-white/50 max-sm:border-emerald-900/10 max-sm:bg-white/[0.08] max-sm:backdrop-blur-md'
      } ${className}`;

  const shellStyle: React.CSSProperties | undefined =
    pastel && !useFrostStack ? { borderColor, backgroundColor: panelFill } : undefined;

  if (layout === 'deck') {
    return (
      <div ref={setNodeRef} className={shell}>
        {children}
      </div>
    );
  }

  const innerGrid = (
    <>
      <h3
        className={`relative z-10 mb-3 shrink-0 text-center text-lg font-semibold ${pastel ? pastel.titleClass : 'text-emerald-500'}`}
      >
        {title}
      </h3>
      <div className="relative z-10 min-h-0 flex-1 overflow-visible">
        <div
          className="box-border flex w-max flex-col flex-wrap content-start items-start gap-4"
          style={{
            minWidth: colsMinWidthInner(placedCount),
            height: categoryCardsFlexHeight(placedCount),
            maxHeight: COLUMN_WRAP_HEIGHT,
          }}
        >
          {children}
        </div>
      </div>
    </>
  );

  if (useFrostStack && frostUrl) {
    return (
      <div
        ref={setNodeRef}
        className={`flex h-full min-h-0 max-h-full flex-col p-4 ${shell}`}
        style={{ minWidth: categoryShellMinWidth(placedCount), borderColor }}
      >
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-3xl" aria-hidden>
          <div
            className="absolute -inset-[15%]"
            style={{
              backgroundImage: `url(${frostUrl})`,
              backgroundAttachment: 'fixed',
              backgroundPosition: 'center',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat',
              filter: 'grayscale(1) blur(22px)',
              opacity: Math.min(0.95, BG_IMAGE_OPACITY * 1.45),
            }}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-0 z-[1] rounded-3xl backdrop-blur-[2px] sm:backdrop-blur-sm"
          style={{ backgroundColor: panelFill }}
          aria-hidden
        />
        {innerGrid}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex h-full min-h-0 max-h-full flex-col overflow-visible p-4 ${shell}`}
      style={{ minWidth: categoryShellMinWidth(placedCount), ...shellStyle }}
    >
      {innerGrid}
    </div>
  );
};

const SortableCard: React.FC<{
  card: CardData;
  isDragging?: boolean;
  onClick?: () => void;
  isFlipped: boolean;
  /** Smaller footprint for mobile unsorted carousel only. */
  compact?: boolean;
}> = ({ card, isDragging, onClick, isFlipped, compact = false }) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: card.id,
    data: card,
  });

  const canFlip = cardHasFlipBack(card);
  const showBack = canFlip && isFlipped;

  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [frontImgOrient, setFrontImgOrient] = useState<'landscape' | 'portrait' | null>(null);
  const [backImgOrient, setBackImgOrient] = useState<'landscape' | 'portrait' | null>(null);
  const visibleImageUrl = (showBack ? card.backImage : card.frontImage)?.trim() || '';
  const canZoom = visibleImageUrl.length > 0;

  useEffect(() => {
    setZoomUrl(null);
  }, [showBack]);

  useEffect(() => {
    setFrontImgOrient(null);
  }, [card.frontImage]);

  useEffect(() => {
    setBackImgOrient(null);
  }, [card.backImage]);

  const onFaceImgLoad =
    (side: 'front' | 'back') => (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
      if (w <= 0 || h <= 0) return;
      const o = w > h ? 'landscape' : 'portrait';
      if (side === 'front') setFrontImgOrient(o);
      else setBackImgOrient(o);
    };

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 50 : 1,
  } : undefined;

  const flipTransition = { duration: 0.38, ease: [0.4, 0, 0.2, 1] as const };

  const stopDragAndFlip = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!canFlip) return;
        // Prevent drag from triggering click if they moved
        if (e.defaultPrevented) return;
        onClick?.();
      }}
      className={`relative max-sm:[touch-action:none] shrink-0 cursor-grab snap-center active:cursor-grabbing [perspective:1000px] ${compact ? 'h-24 w-32' : 'h-36 w-48'} ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Two-layer flip: works when an ancestor uses transform: scale() (3D backface-hidden is flattened there). */}
      <div
        className={`relative h-full w-full overflow-visible shadow-[0_2px_10px_rgba(15,23,42,0.06),0_4px_20px_-4px_rgba(15,23,42,0.1)] ${compact ? 'rounded-xl' : 'rounded-2xl'}`}
      >
        <motion.div
          aria-hidden={showBack}
          className={`absolute inset-0 flex flex-col justify-end items-start overflow-visible border-2 border-emerald-100 bg-white ${compact ? 'rounded-xl p-1.5' : 'rounded-2xl p-2'}`}
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
            <div className={`pointer-events-none absolute inset-0 overflow-hidden ${compact ? 'rounded-xl' : 'rounded-2xl'}`}>
              <div className={`relative flex h-full min-h-0 w-full items-center justify-center ${compact ? 'p-1' : 'p-2'}`}
              >
                <img
                  src={card.frontImage}
                  alt="Card front"
                  className={
                    frontImgOrient === 'landscape'
                      ? `h-full w-full min-h-0 object-cover object-center ${CARD_IMAGE_BLEED_LANDSCAPE_CLASS}`
                      : `max-h-full max-w-full object-contain ${CARD_IMAGE_BLEED_CLASS}`
                  }
                  referrerPolicy="no-referrer"
                  onLoad={onFaceImgLoad('front')}
                />
                <div className={`pointer-events-none absolute inset-0 bg-black/20 ${compact ? 'rounded-xl' : 'rounded-2xl'}`} />
              </div>
            </div>
          )}
          <div
            className={`relative z-10 min-w-0 max-w-full text-left break-words text-slate-800 drop-shadow-sm bg-white/80 rounded-md ${compact ? 'px-1.5 py-0.5 text-[10px] leading-tight' : 'px-2 py-1 text-sm font-medium'}`}
          >
            {card.frontText}
          </div>
        </motion.div>

        {canFlip ? (
          <motion.div
            aria-hidden={!showBack}
            className={`absolute inset-0 flex flex-col justify-end items-start overflow-visible border-2 border-amber-200 bg-amber-50 ${compact ? 'rounded-xl p-1.5' : 'rounded-2xl p-2'}`}
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
              <div className={`pointer-events-none absolute inset-0 overflow-hidden ${compact ? 'rounded-xl' : 'rounded-2xl'}`}>
                <div className={`relative flex h-full min-h-0 w-full items-center justify-center ${compact ? 'p-1' : 'p-2'}`}
                >
                  <img
                    src={card.backImage}
                    alt="Card back"
                    className={
                      backImgOrient === 'landscape'
                        ? `h-full w-full min-h-0 object-cover object-center ${CARD_IMAGE_BLEED_LANDSCAPE_CLASS}`
                        : `max-h-full max-w-full object-contain ${CARD_IMAGE_BLEED_CLASS}`
                    }
                    referrerPolicy="no-referrer"
                    onLoad={onFaceImgLoad('back')}
                  />
                  <div className={`pointer-events-none absolute inset-0 bg-black/20 ${compact ? 'rounded-xl' : 'rounded-2xl'}`} />
                </div>
              </div>
            )}
            <div
              className={`relative z-10 min-w-0 max-w-full text-left break-words text-slate-800 drop-shadow-sm bg-white/80 rounded-md ${compact ? 'px-1.5 py-0.5 text-[10px] leading-tight' : 'px-2 py-1 text-sm font-medium'}`}
            >
              {card.backText || 'No back text'}
            </div>
          </motion.div>
        ) : null}

        {canZoom ? (
          <button
            type="button"
            aria-label="View full size image"
            className={`group absolute z-30 flex cursor-pointer items-center justify-center rounded-full bg-transparent text-slate-800 transition-colors hover:text-emerald-700 ${compact ? 'top-0.5 right-0.5 h-6 w-6' : 'top-1 right-1 h-7 w-7'}`}
            onPointerDown={stopDragAndFlip}
            onClick={(e) => {
              stopDragAndFlip(e);
              setZoomUrl(visibleImageUrl);
            }}
          >
            <ZoomIn
              className={`transition-[filter] duration-200 ease-out [filter:drop-shadow(0_0_1px_rgba(255,255,255,0.95))_drop-shadow(0_1px_3px_rgba(15,23,42,0.55))] group-hover:[filter:drop-shadow(0_0_1px_rgba(255,255,255,0.95))_drop-shadow(0_1px_3px_rgba(15,23,42,0.45))_drop-shadow(0_0_6px_rgba(16,185,129,0.55))_drop-shadow(0_0_12px_rgba(16,185,129,0.2))] ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
              strokeWidth={2.25}
            />
          </button>
        ) : null}
      </div>
    </div>

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
    </>
  );
}

/** Mobile unsorted row: drag wins over native scroll; range input adjusts horizontal offset. */
function NarrowUnsortedDeck({
  deckCards,
  flippedCards,
  onFlip,
}: {
  deckCards: CardData[];
  flippedCards: Record<string, boolean>;
  onFlip: (id: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [hScroll, setHScroll] = useState(0);
  const [contentW, setContentW] = useState(0);
  const [viewW, setViewW] = useState(0);

  const layoutKey = deckCards.map((c) => c.id).join(',');

  useLayoutEffect(() => {
    const row = rowRef.current;
    const vp = viewportRef.current;
    if (!row || !vp) return;

    const update = () => {
      const totalW = row.scrollWidth;
      const vw = vp.clientWidth;
      const maxScroll = Math.max(0, totalW - vw);
      setContentW(totalW);
      setViewW(vw);
      setHScroll((prev) => Math.min(Math.max(0, prev), maxScroll));
    };

    update();
    const ro = new ResizeObserver(() => requestAnimationFrame(update));
    ro.observe(row);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [layoutKey]);

  const maxScroll = Math.max(0, contentW - viewW);
  const rangeMax = maxScroll <= 0 ? 1 : maxScroll;
  const rangeValue = maxScroll <= 0 ? 0 : Math.min(hScroll, maxScroll);

  return (
    <div className="flex w-full flex-col gap-1">
      <div ref={viewportRef} className="w-full overflow-hidden">
        <div
          ref={rowRef}
          className="flex w-max max-w-none flex-nowrap gap-2"
          style={{ transform: `translate3d(${-hScroll}px,0,0)` }}
        >
          {deckCards.length === 0 ? (
            <div className="flex min-h-14 w-full min-w-full shrink-0 items-center justify-center text-sm text-slate-400">
              All cards sorted!
            </div>
          ) : (
            deckCards.map((card) => (
              <SortableCard
                key={card.id}
                card={card}
                compact
                isFlipped={!!flippedCards[card.id]}
                onClick={() => onFlip(card.id)}
              />
            ))
          )}
        </div>
      </div>
      {deckCards.length > 0 ? (
        <div className="mt-1 w-full rounded-full border border-emerald-600/25 bg-emerald-50/90 px-1 py-0.5">
          <input
            type="range"
            aria-label="Scroll unsorted cards horizontally"
            min={0}
            max={rangeMax}
            step={1}
            value={rangeValue}
            disabled={maxScroll <= 0}
            onChange={(e) => setHScroll(Number(e.target.value))}
            className="range-wide-emerald-thumb relative z-[1] m-0 h-7 w-full cursor-pointer appearance-none align-middle disabled:cursor-default disabled:opacity-55"
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Categories grow to natural width (extra card columns widen each box). When the combined
 * layout exceeds the viewport, the whole group scales down — no scrolling.
 *
 * Wide layout uses CSS `zoom` (when supported) instead of `transform: scale()` so category
 * panels can use `backdrop-filter`; transform ancestors disable / flatten backdrop blur.
 */
function ScaledCategoriesRegion({
  children,
  measureKey,
  useCssZoomScaling = false,
}: {
  children: React.ReactNode;
  measureKey: string;
  useCssZoomScaling?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ bw: 0, bh: 0, s: 1 });
  /** Defer until after mount so SSR/first paint matches (transform), then switch to zoom on web. */
  const [cssZoomSupported, setCssZoomSupported] = useState(false);

  const measure = useCallback(() => {
    const outer = containerRef.current;
    const inner = contentRef.current;
    if (!outer || !inner) return;
    const cw = Math.max(1, outer.clientWidth - 6);
    const ch = Math.max(1, outer.clientHeight - 6);
    const bw = inner.scrollWidth;
    const bh = inner.scrollHeight;
    if (bw < 1 || bh < 1) return;
    const s = Math.min(1, cw / bw, ch / bh);
    setFit({ bw, bh, s });
  }, []);

  useLayoutEffect(() => {
    let frame = requestAnimationFrame(() => measure());
    const outer = containerRef.current;
    const ro = new ResizeObserver(() => measure());
    if (outer) ro.observe(outer);
    const inner = contentRef.current;
    if (inner) ro.observe(inner);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [measure, measureKey]);

  useLayoutEffect(() => {
    if (!useCssZoomScaling) {
      setCssZoomSupported(false);
      return;
    }
    setCssZoomSupported(typeof CSS !== 'undefined' && !!CSS.supports?.('zoom', '1'));
  }, [useCssZoomScaling]);

  const clipW = fit.bw > 0 ? fit.bw * fit.s : undefined;
  const clipH = fit.bh > 0 ? fit.bh * fit.s : undefined;
  const scaleWithCssZoom = useCssZoomScaling && cssZoomSupported;

  return (
    <div
      ref={containerRef}
      className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] items-stretch overflow-hidden bg-transparent"
    >
      {/* Side tracks absorb slack so wider categories use space from both viewport edges. */}
      <div className="min-h-0 min-w-0 bg-transparent" aria-hidden />
      <div className="flex h-full min-h-0 min-w-0 items-center justify-center bg-transparent">
        <div
          className="flex max-h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden bg-transparent"
          style={
            clipW != null && clipH != null
              ? { width: clipW, height: clipH, maxWidth: '100%' }
              : { minHeight: '6rem' }
          }
        >
          <div
            ref={contentRef}
            className="flex w-max max-w-none flex-nowrap items-stretch gap-3"
            style={
              scaleWithCssZoom
                ? { zoom: fit.s }
                : {
                    transform: `scale(${fit.s})`,
                    transformOrigin: 'top left',
                  }
            }
          >
            {children}
          </div>
        </div>
      </div>
      <div className="min-h-0 min-w-0 bg-transparent" aria-hidden />
    </div>
  );
}

function ActivityShell({
  backgroundImage,
  variant,
  children,
}: {
  backgroundImage?: string;
  variant: 'welcome' | 'play';
  children: React.ReactNode;
}) {
  const url = backgroundImage?.trim();
  const [imgNaturalW, setImgNaturalW] = useState<number | null>(null);
  const [viewportW, setViewportW] = useState(0);

  useEffect(() => {
    setImgNaturalW(null);
    if (!url) return;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => setImgNaturalW(img.naturalWidth > 0 ? img.naturalWidth : null);
    img.onerror = () => setImgNaturalW(null);
    img.src = url;
  }, [url]);

  useEffect(() => {
    const sync = () => setViewportW(window.innerWidth);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const tileHorizontal = imgNaturalW != null && viewportW > 0 && imgNaturalW < viewportW;

  const bgStyle: React.CSSProperties | undefined = url
    ? {
        backgroundImage: `url(${url})`,
        opacity: BG_IMAGE_OPACITY,
        ...(tileHorizontal
          ? {
              backgroundRepeat: 'repeat-x',
              backgroundPosition: 'center top',
              backgroundSize: 'auto 100%',
            }
          : {
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              backgroundSize: 'contain',
            }),
      }
    : undefined;

  const baseClass = variant === 'welcome' ? 'bg-emerald-50/30' : 'bg-transparent';
  return (
    <div
      className={`relative flex flex-col ${variant === 'play' ? 'h-dvh max-h-dvh overflow-hidden' : 'min-h-screen'} ${baseClass}`}
    >
      {url ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 grayscale"
          style={bgStyle}
        />
      ) : null}
      <div
        className={
          variant === 'play'
            ? 'relative z-[1] flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-transparent'
            : 'relative z-[1] flex min-h-screen flex-col'
        }
      >
        {children}
      </div>
    </div>
  );
}

export default function ActivityView() {
  const { activityId } = useParams();
  const { pathname } = useLocation();
  /** `/play/…` is the student-facing URL; `/activity/…` is facilitator preview. */
  const isStudentMode = pathname.startsWith('/play/');
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const narrowPlay = useNarrowPlayLayout();

  /** Mobile-only: chosen after name entry; desktop always behaves as sort. */
  const [mobilePlayMode, setMobilePlayMode] = useState<'sort' | 'swipe' | null>(null);
  const [mobileModeDraft, setMobileModeDraft] = useState<'sort' | 'swipe'>('sort');
  const [showSortedGallery, setShowSortedGallery] = useState(false);
  const [sortedGalleryZoomUrl, setSortedGalleryZoomUrl] = useState<string | null>(null);
  const swipeAutoSubmitLockRef = useRef(false);
  const responseSubmitLockRef = useRef(false);
  const [isGatheringClassData, setIsGatheringClassData] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia(NARROW_PLAY_LAYOUT_MQ).matches) {
      setMobilePlayMode('sort');
    }
  }, []);

  useEffect(() => {
    if (!narrowPlay) setMobilePlayMode('sort');
  }, [narrowPlay]);

  const [showResultDialog, setShowResultDialog] = useState(false);
  const [resultData, setResultData] = useState<{
    incorrectCount: number;
    /** Per-card class % correct; only when scored sort + showScore and placement breakdown is off */
    cardClassPercents: { cardId: string; label: string; percent: number }[] | null;
    placementBreakdown: CardPlacementBreakdownRow[] | null;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 3, tolerance: 12 } })
  );

  /** Must run every render (before any conditional return) — used only on the play screen. */
  const categoryLayoutKey = useMemo(() => {
    if (!activity) return '';
    return activity.categories
      .map((c) => `${c}:${activity.cards.filter((x) => placements[x.id] === c).length}`)
      .join('|');
  }, [activity, placements]);

  const deckCardsInDeck = useMemo(
    () => (activity ? activity.cards.filter((c) => placements[c.id] === 'deck') : []),
    [activity, placements]
  );

  useEffect(() => {
    const fetchActivity = async () => {
      if (!activityId) return;
      try {
        const docRef = doc(db, 'activities', activityId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Activity;
          setActivity({ id: docSnap.id, ...data });
          
          // Initialize placements to 'deck'
          const initialPlacements: Record<string, string> = {};
          data.cards.forEach(c => {
            initialPlacements[c.id] = 'deck';
          });
          setPlacements(initialPlacements);
        } else {
          toast.error('Activity not found');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `activities/${activityId}`);
      } finally {
        setLoading(false);
      }
    };
    fetchActivity();
  }, [activityId]);

  useEffect(() => {
    if (!showResultDialog || !activity?.id || !activity.showPlacementBreakdown) return;
    const col = collection(db, `activities/${activity.id}/responses`);
    const unsubscribe = onSnapshot(
      col,
      (snap) => {
        const resps = snap.docs.map((d) => d.data() as { placements?: Record<string, string> });
        const placementBreakdown = computeClassPlacementByCard(activity.categories, activity.cards, resps);
        setResultData((prev) =>
          prev
            ? { ...prev, placementBreakdown }
            : {
                incorrectCount: 0,
                cardClassPercents: null,
                placementBreakdown,
              },
        );
      },
      (error) => {
        console.error('responses snapshot', error);
        toast.error('Could not keep class results up to date');
      },
    );
    return () => unsubscribe();
  }, [showResultDialog, activity]);

  /** Mobile play: lock document scroll/bounce/pull-refresh; discourage pinch & long-press zoom while sorting. */
  useEffect(() => {
    if (!hasStarted || !activity || typeof window === 'undefined') return;
    if (!window.matchMedia(NARROW_PLAY_LAYOUT_MQ).matches) return;

    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');

    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      htmlHeight: html.style.height,
      htmlBg: html.style.backgroundColor,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyTouchAction: body.style.touchAction,
      bodyBg: body.style.backgroundColor,
      bodyWebkitTouchCallout: (body.style as CSSStyleDeclaration & { webkitTouchCallout?: string })
        .webkitTouchCallout,
      rootOverflow: root?.style.overflow ?? '',
      rootOverscroll: root?.style.overscrollBehavior ?? '',
      rootBg: root?.style.backgroundColor ?? '',
      viewportContent: meta?.getAttribute('content') ?? null,
    };

    const shellBg = 'transparent';
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    html.style.height = '100%';
    html.style.backgroundColor = shellBg;
    body.style.overflow = 'hidden';
    body.style.backgroundColor = shellBg;
    body.style.overscrollBehavior = 'none';
    body.style.touchAction = 'manipulation';
    (body.style as CSSStyleDeclaration & { webkitTouchCallout?: string }).webkitTouchCallout = 'none';
    if (root) {
      root.style.overflow = 'hidden';
      root.style.overscrollBehavior = 'none';
      root.style.backgroundColor = shellBg;
    }
    if (meta) {
      meta.setAttribute(
        'content',
        'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
      );
    }

    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      html.style.height = prev.htmlHeight;
      html.style.backgroundColor = prev.htmlBg;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.touchAction = prev.bodyTouchAction;
      body.style.backgroundColor = prev.bodyBg;
      (body.style as CSSStyleDeclaration & { webkitTouchCallout?: string }).webkitTouchCallout =
        prev.bodyWebkitTouchCallout ?? '';
      if (root) {
        root.style.overflow = prev.rootOverflow;
        root.style.overscrollBehavior = prev.rootOverscroll;
        root.style.backgroundColor = prev.rootBg;
      }
      if (meta && prev.viewportContent != null) meta.setAttribute('content', prev.viewportContent);
      else if (meta)
        meta.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
    };
  }, [hasStarted, activity, narrowPlay]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: any) => {
    setActiveCategory(event.over?.id as string || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveCategory(null);

    if (over && over.id !== placements[active.id as string]) {
      setPlacements(prev => ({
        ...prev,
        [active.id as string]: over.id as string
      }));
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setActiveCategory(null);
  };

  const handleFlip = (id: string) => {
    const card = activity?.cards.find((c) => c.id === id);
    if (card && !cardHasFlipBack(card)) return;
    setFlippedCards((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleReset = () => {
    if (!activity) return;
    const initialPlacements: Record<string, string> = {};
    activity.cards.forEach(c => {
      initialPlacements[c.id] = 'deck';
    });
    setPlacements(initialPlacements);
    setFlippedCards({});
    swipeAutoSubmitLockRef.current = false;
  };

  const handleSubmit = useCallback(async () => {
    if (!activity) return;
    if (responseSubmitLockRef.current) return;

    const unplaced = Object.values(placements).filter((p) => p === 'deck').length;
    if (unplaced > 0) {
      toast.error(`Please place all cards. ${unplaced} remaining.`);
      return;
    }

    const scored = isScoredSort(activity);
    let incorrectCount = 0;

    if (scored) {
      activity.cards.forEach((card) => {
        if (placements[card.id] !== card.correctCategory) {
          incorrectCount++;
        }
      });
    }

    const score = scored ? Math.round(((activity.cards.length - incorrectCount) / activity.cards.length) * 100) : 0;

    responseSubmitLockRef.current = true;
    setIsGatheringClassData(true);
    try {
      await addDoc(collection(db, `activities/${activity.id}/responses`), {
        studentName,
        placements,
        score,
        submittedAt: serverTimestamp(),
      });

      const resCol = collection(db, `activities/${activity.id}/responses`);
      const snap = await getDocs(resCol);
      const resps = snap.docs.map((d) => d.data() as { placements?: Record<string, string> });
      const n = resps.length;

      const showCorrectBars = scored && activity.showScore && !activity.showPlacementBreakdown;
      let cardClassPercents: { cardId: string; label: string; percent: number }[] | null = null;
      if (showCorrectBars) {
        try {
          if (n > 0) {
            cardClassPercents = activity.cards.map((card) => {
              const ok = resps.filter((r) => r.placements?.[card.id] === card.correctCategory).length;
              return {
                cardId: card.id,
                label: card.frontText.trim() || 'Untitled card',
                percent: Math.round((ok / n) * 100),
              };
            });
          } else {
            cardClassPercents = [];
          }
        } catch {
          cardClassPercents = null;
          toast.error('Could not load class results');
        }
      }

      const placementBreakdown = activity.showPlacementBreakdown
        ? computeClassPlacementByCard(activity.categories, activity.cards, resps)
        : null;

      setResultData({ incorrectCount, cardClassPercents, placementBreakdown });
      setShowResultDialog(true);
    } catch (error) {
      swipeAutoSubmitLockRef.current = false;
      handleFirestoreError(error, OperationType.CREATE, `activities/${activity.id}/responses`);
      toast.error('Failed to submit response');
    } finally {
      responseSubmitLockRef.current = false;
      setIsGatheringClassData(false);
    }
  }, [activity, studentName, placements]);

  useEffect(() => {
    if (!hasStarted || !activity || !narrowPlay || mobilePlayMode !== 'swipe') return;
    const allPlaced = activity.cards.every((c) => placements[c.id] !== 'deck');
    if (!allPlaced) {
      swipeAutoSubmitLockRef.current = false;
      return;
    }
    if (showResultDialog || swipeAutoSubmitLockRef.current) return;
    swipeAutoSubmitLockRef.current = true;
    void handleSubmit();
  }, [hasStarted, activity, narrowPlay, mobilePlayMode, placements, showResultDialog, handleSubmit]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!activity) return <div className="p-8 text-center">Activity not found</div>;

  const tryStartActivity = () => {
    if (studentName.trim()) setHasStarted(true);
    else toast.error('Please enter your name');
  };

  if (!hasStarted) {
    return (
      <Fragment key="activity-welcome">
      <ActivityShell backgroundImage={activity.backgroundImage} variant="welcome">
      <div className="flex flex-1 items-center justify-center bg-transparent p-4 max-sm:pt-[max(1rem,env(safe-area-inset-top,0px))] max-sm:pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
        <Card className="w-full max-w-md shadow-xl border-0 bg-white/80 backdrop-blur-sm rounded-3xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-3xl font-bold text-emerald-500">{activity.title}</CardTitle>
            <CardDescription className="text-emerald-600/80">Enter your name to begin the card sort.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <Input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  tryStartActivity();
                }
              }}
              placeholder="Your Name"
              className="rounded-xl text-lg p-6"
            />
            <Button
              onClick={tryStartActivity}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-full py-6 text-lg shadow-lg shadow-emerald-500/20"
            >
              Start Activity
            </Button>
          </CardContent>
        </Card>
      </div>
      </ActivityShell>
      </Fragment>
    );
  }

  const swipeModeEligible =
    activity.categories.length >= 1 && activity.categories.length <= 4;

  if (narrowPlay && mobilePlayMode === null) {
    const confirmMobileMode = () => {
      if (mobileModeDraft === 'swipe' && !swipeModeEligible) {
        toast.error('Swipe mode needs between 1 and 4 categories.');
        return;
      }
      setMobilePlayMode(mobileModeDraft);
    };

    return (
      <Fragment key="activity-mode">
        <ActivityShell backgroundImage={activity.backgroundImage} variant="play">
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
            style={{
              paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
            }}
          >
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/80">
              <h2 className="text-center text-xl font-bold text-emerald-600">Mode</h2>
              <p className="mt-1 text-center text-sm text-slate-500">How do you want to sort cards?</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMobileModeDraft('sort')}
                  className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-colors ${
                    mobileModeDraft === 'sort'
                      ? 'border-emerald-500 bg-emerald-50/80'
                      : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <img src="/sort_icon.png" alt="" className="h-12 w-12 object-contain" />
                  <span className="text-sm font-semibold text-slate-800">Sort</span>
                </button>
                <button
                  type="button"
                  disabled={!swipeModeEligible}
                  onClick={() => swipeModeEligible && setMobileModeDraft('swipe')}
                  title={
                    swipeModeEligible ? undefined : 'Swipe needs 1–4 categories'
                  }
                  className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-colors ${
                    !swipeModeEligible
                      ? 'cursor-not-allowed opacity-45'
                      : mobileModeDraft === 'swipe'
                        ? 'border-emerald-500 bg-emerald-50/80'
                        : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <img src="/swipe_icon.png" alt="" className="h-12 w-12 object-contain" />
                  <span className="text-sm font-semibold text-slate-800">Swipe</span>
                </button>
              </div>
              {!swipeModeEligible ? (
                <p className="mt-3 text-center text-xs text-amber-700">
                  Swipe mode is available when this activity has 1–4 categories.
                </p>
              ) : null}
              <Button
                type="button"
                className="mt-6 w-full rounded-full bg-emerald-500 py-6 text-lg font-semibold text-white hover:bg-emerald-600"
                onClick={confirmMobileMode}
              >
                Continue
              </Button>
            </div>
          </div>
        </ActivityShell>
      </Fragment>
    );
  }

  const activeCard = activeId ? activity.cards.find(c => c.id === activeId) : null;
  const showClassCode = isStudentMode && !!activity.studentCode;
  const useSwipePlay = narrowPlay && mobilePlayMode === 'swipe' && swipeModeEligible;

  return (
    <Fragment key="activity-play">
    <ActivityShell backgroundImage={activity.backgroundImage} variant="play">
    <div
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-transparent max-sm:overscroll-none max-sm:[touch-action:manipulation]"
      onContextMenu={(e) => {
        if (narrowPlay) e.preventDefault();
      }}
    >
      <header className="sticky top-0 z-20 flex shrink-0 flex-col bg-white pt-[env(safe-area-inset-top,0px)] shadow-sm">
        <div className="relative flex min-h-[3rem] items-center px-4 py-2 sm:min-h-0 sm:px-6 sm:py-4">
          <div className="relative z-10 min-w-0 flex-1 pointer-events-none">
            <div className="pointer-events-auto max-w-full min-w-0">
              <h1 className="truncate text-xl font-bold text-emerald-500">{activity.title}</h1>
              <p className="text-sm text-slate-500">Student: {studentName}</p>
            </div>
          </div>
          <div
            className={`pointer-events-none absolute inset-0 z-[5] flex items-center justify-center ${showClassCode ? 'px-[min(10.5rem,46vw)]' : ''}`}
          >
            <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
              <Button
                type="button"
                variant="outline"
                aria-label="Reset"
                title="Reset"
                onClick={handleReset}
                className="hidden h-12 w-12 shrink-0 rounded-full border-emerald-200 p-0 text-emerald-700 hover:bg-emerald-50 sm:inline-flex sm:h-14 sm:w-14"
              >
                <RotateCcw className="size-5 sm:size-6" />
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isGatheringClassData}
                className="hidden h-12 gap-2 rounded-full bg-emerald-500 px-6 text-base font-semibold shadow-md hover:bg-emerald-600 sm:inline-flex sm:h-14 sm:px-8 sm:text-lg disabled:opacity-60"
              >
                <CheckCircle2 className="size-5 shrink-0 sm:size-6" />
                Submit
              </Button>
            </div>
          </div>
          <div className="relative z-10 min-w-0 flex-1 pointer-events-none" aria-hidden />
          {showClassCode ? (
            <div className="pointer-events-auto absolute end-3 top-1/2 z-20 -translate-y-1/2 sm:end-6">
              <div
                className="flex max-w-[min(42vw,11rem)] items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700 sm:max-w-none sm:gap-2 sm:px-3 sm:py-1.5"
                title="Class code"
              >
                <span className="shrink-0 text-xs font-medium text-slate-500 sm:text-sm">Class code</span>
                <span className="min-w-0 truncate font-mono text-xs font-semibold tracking-wider text-slate-900 sm:text-sm">
                  {activity.studentCode}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent pt-2 pb-0 max-sm:px-0 sm:px-5 sm:pt-3">
        {useSwipePlay ? (
          <SwipePlayArea
            categories={activity.categories}
            deckCards={deckCardsInDeck}
            flippedCards={flippedCards}
            onFlip={handleFlip}
            onPlaceCard={(cardId, cat) =>
              setPlacements((prev) => ({ ...prev, [cardId]: cat }))
            }
          />
        ) : (
          <DndContext
            sensors={sensors}
            autoScroll={narrowPlay ? false : undefined}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
              {/* Categories: flex-1 fills space so unsorted deck stays pinned to bottom */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent px-0.5 py-0.5 max-sm:px-3">
                <ScaledCategoriesRegion measureKey={categoryLayoutKey} useCssZoomScaling={!narrowPlay}>
                  {activity.categories.map((cat, categoryIndex) => {
                    const placedHere = activity.cards.filter((c) => placements[c.id] === cat);
                    return (
                      <div
                        key={cat}
                        className="flex h-full max-h-full min-h-0 max-w-none shrink-0 self-stretch overflow-visible"
                      >
                        <DroppableCategory
                          id={cat}
                          title={cat}
                          isOver={activeCategory === cat}
                          className="w-max max-w-none"
                          placedCount={placedHere.length}
                          categoryColorIndex={categoryIndex}
                          playBackgroundImage={activity.backgroundImage}
                          viewportFixedGlass={!narrowPlay}
                        >
                          {placedHere.map((card) => (
                            <SortableCard
                              key={card.id}
                              card={card}
                              isFlipped={!!flippedCards[card.id]}
                              onClick={() => handleFlip(card.id)}
                            />
                          ))}
                        </DroppableCategory>
                      </div>
                    );
                  })}
                </ScaledCategoriesRegion>
              </div>

              {/* Deck: pinned to bottom (flex-1 categories above + mt-auto fallback on narrow) */}
              <div className="mt-auto w-full shrink-0 border-t border-slate-200/40 bg-transparent pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-2 max-sm:mt-4 max-sm:border-slate-200/90 max-sm:bg-[#f5f7f5]/95 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] max-sm:pt-3 max-sm:shadow-[0_-8px_24px_-4px_rgba(15,23,42,0.08)] max-sm:backdrop-blur-sm max-sm:border-x-0 sm:rounded-none sm:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pt-3">
                <div className="mb-1 flex items-center justify-between gap-2 px-2 max-sm:mb-1 max-sm:px-[max(0.75rem,env(safe-area-inset-left))] max-sm:pr-[max(0.75rem,env(safe-area-inset-right))] sm:mb-2 sm:px-2">
                  <h3 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:text-sm">
                    Unsorted Cards
                  </h3>
                  <div className="flex shrink-0 items-center gap-2 sm:hidden">
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Reset"
                      title="Reset"
                      onClick={handleReset}
                      className="h-9 w-9 shrink-0 rounded-full border-emerald-200 p-0 text-emerald-700 hover:bg-emerald-50"
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                    {!useSwipePlay ? (
                      <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isGatheringClassData}
                        className="h-9 shrink-0 gap-1.5 rounded-full bg-emerald-500 px-4 text-sm font-semibold text-white shadow-md hover:bg-emerald-600 disabled:opacity-60"
                      >
                        <CheckCircle2 className="size-4 shrink-0" />
                        Submit
                      </Button>
                    ) : null}
                  </div>
                </div>
                <DroppableCategory
                  id="deck"
                  title=""
                  layout="deck"
                  isOver={activeCategory === 'deck'}
                  className="max-sm:rounded-none max-sm:border-x-0 max-sm:p-1.5 max-sm:pb-1 sm:rounded-3xl sm:p-0"
                >
                  {narrowPlay ? (
                    <NarrowUnsortedDeck
                      deckCards={deckCardsInDeck}
                      flippedCards={flippedCards}
                      onFlip={handleFlip}
                    />
                  ) : (
                    <div className="flex min-h-[140px] max-h-[40vh] flex-wrap content-start justify-center gap-3 overflow-y-auto rounded-2xl border-2 border-dashed border-slate-300 bg-white/50 p-3 sm:min-h-[160px] sm:max-h-[40vh] sm:gap-4 sm:rounded-3xl sm:p-4">
                      {deckCardsInDeck.map((card) => (
                        <SortableCard
                          key={card.id}
                          card={card}
                          isFlipped={!!flippedCards[card.id]}
                          onClick={() => handleFlip(card.id)}
                        />
                      ))}
                      {deckCardsInDeck.length === 0 && (
                        <div className="flex min-h-[6rem] w-full items-center justify-center text-slate-400">
                          All cards sorted!
                        </div>
                      )}
                    </div>
                  )}
                </DroppableCategory>
              </div>
            </div>

            <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
              {activeCard ? (
                <SortableCard
                  card={activeCard}
                  isDragging
                  isFlipped={!!flippedCards[activeCard.id]}
                  compact={narrowPlay && placements[activeCard.id] === 'deck'}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {useSwipePlay && typeof document !== 'undefined'
          ? createPortal(
              <Button
                type="button"
                variant="outline"
                className="pointer-events-auto fixed bottom-[max(5.5rem,env(safe-area-inset-bottom,0px)+4rem)] left-1/2 z-[200] -translate-x-1/2 rounded-full border-emerald-300 bg-white/95 px-5 py-2.5 text-sm font-medium text-emerald-800 shadow-lg backdrop-blur-sm"
                onClick={() => setShowSortedGallery(true)}
              >
                <LayoutGrid className="mr-2 inline size-4 align-middle" />
                Sorted cards
              </Button>,
              document.body
            )
          : null}
      </main>

      <Dialog
        open={showSortedGallery}
        onOpenChange={(open) => {
          setShowSortedGallery(open);
          if (!open) setSortedGalleryZoomUrl(null);
        }}
      >
        <DialogContent className="max-h-[min(88dvh,36rem)] max-w-md overflow-hidden rounded-3xl sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl text-emerald-600">Sorted cards</DialogTitle>
          </DialogHeader>
          <div className="max-h-[min(58dvh,24rem)] space-y-5 overflow-y-auto py-2 pr-1">
            {activity.categories.some((cat) =>
              activity.cards.some((c) => placements[c.id] === cat)
            ) ? (
              activity.categories.map((cat, catIdx) => {
                const sortedHere = activity.cards.filter((c) => placements[c.id] === cat);
                if (sortedHere.length === 0) return null;
                const secPastel = categoryPastelAt(catIdx);
                return (
                  <section key={cat}>
                    <h3 className={`mb-2 text-sm font-semibold ${secPastel.titleClass}`}>{cat}</h3>
                    <div className="flex flex-wrap gap-2">
                      {sortedHere.map((card) => {
                        const img = card.frontImage?.trim();
                        if (img) {
                          return (
                            <button
                              key={card.id}
                              type="button"
                              aria-label={`View full size: ${card.frontText.trim() || 'card'}`}
                              className="h-16 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-white shadow-sm transition-[border-color,opacity] hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                              style={{
                                borderColor: secPastel.border,
                                outlineColor: secPastel.borderOver,
                              }}
                              onClick={() => setSortedGalleryZoomUrl(img)}
                            >
                              <img
                                src={img}
                                alt=""
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </button>
                          );
                        }
                        return (
                          <div
                            key={card.id}
                            className="flex h-16 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 bg-white p-1 text-center text-[9px] leading-tight font-medium text-slate-700 shadow-sm"
                            style={{ borderColor: secPastel.border }}
                          >
                            {card.frontText.trim() || 'Card'}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">
                No sorted cards yet — swipe cards to a category to see them here.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sortedGalleryZoomUrl != null} onOpenChange={(open) => !open && setSortedGalleryZoomUrl(null)}>
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
          {sortedGalleryZoomUrl ? (
            <img
              src={sortedGalleryZoomUrl}
              alt=""
              className="mx-auto block w-full max-w-full object-contain max-sm:max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] max-sm:rounded-none sm:max-h-[85vh] sm:w-auto sm:rounded-md"
              referrerPolicy="no-referrer"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="rounded-3xl sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl text-center">Activity Complete!</DialogTitle>
            <DialogDescription className="text-center text-lg pt-4">
              {activity.checkAnswers && isScoredSort(activity) && resultData && resultData.incorrectCount > 0 ? (
                <span className="text-amber-600 font-medium">
                  You have {resultData.incorrectCount} incorrect card{resultData.incorrectCount > 1 ? 's' : ''}.
                </span>
              ) : activity.checkAnswers && isScoredSort(activity) && resultData && resultData.incorrectCount === 0 ? (
                <span className="text-emerald-600 font-medium">
                  Perfect! All cards are in the correct category.
                </span>
              ) : (
                <span>Your response has been recorded.</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {activity.showPlacementBreakdown && resultData?.placementBreakdown && resultData.placementBreakdown.length > 0 ? (
            <div className="max-h-[min(52vh,28rem)] space-y-2 overflow-y-auto py-4 pr-1">
              <p className="text-center text-sm font-medium text-slate-600">
                Class placement — how everyone sorted each card
              </p>
              <p className="text-center text-xs text-slate-500">Updates live as more responses come in.</p>
              <ClassPlacementBreakdownList
                categoryOrder={activity.categories}
                rows={resultData.placementBreakdown}
                listLabel="Class placement by card"
              />
            </div>
          ) : null}

          {isScoredSort(activity) &&
          activity.showScore &&
          !activity.showPlacementBreakdown &&
          resultData?.cardClassPercents &&
          resultData.cardClassPercents.length > 0 ? (
            <div className="max-h-[min(52vh,28rem)] space-y-3 overflow-y-auto py-4 pr-1">
              <p className="text-center text-sm font-medium text-slate-600">
                Class results — % who placed each card correctly
              </p>
              <ul className="space-y-3">
                {resultData.cardClassPercents.map((row) => (
                  <li key={row.cardId}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-slate-600 sm:text-sm">
                      <span className="min-w-0 truncate font-medium text-slate-800" title={row.label}>
                        {row.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500">{row.percent}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${row.percent}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {isScoredSort(activity) &&
          activity.showScore &&
          !activity.showPlacementBreakdown &&
          resultData?.cardClassPercents &&
          resultData.cardClassPercents.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">No class data yet.</p>
          ) : null}

          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => {
                setShowResultDialog(false);
                handleReset();
              }}
              className="rounded-full px-8 bg-slate-900 text-white hover:bg-slate-800"
            >
              Retry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ActivityShell>
    {isGatheringClassData && typeof document !== 'undefined'
      ? createPortal(
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px]"
          >
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200/90 bg-white/95 px-10 py-8 shadow-xl">
              <RotateCw className="size-10 animate-spin text-emerald-600" strokeWidth={2.25} aria-hidden />
              <p className="max-w-[18rem] text-center text-base font-medium text-slate-800">
                Gather class data…
              </p>
            </div>
          </div>,
          document.body
        )
      : null}
    </Fragment>
  );
}

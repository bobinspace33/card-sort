import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, getDocs, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Activity, CardData } from '../types';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RotateCcw, CheckCircle2, ZoomIn } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

/** Card size: w-48 h-36 + gap-4 — max 3 cards per column before wrapping. */
const CARD_W = '12rem';
const CARD_H = '9rem';
const CARD_GAP = '1rem';
const MAX_CARDS_PER_COLUMN = 3;
const COLUMN_WRAP_HEIGHT = `calc(${MAX_CARDS_PER_COLUMN} * ${CARD_H} + ${MAX_CARDS_PER_COLUMN - 1} * ${CARD_GAP})`;

/** After object-contain layout, scale so the image peeks slightly past the card border (vertical emphasis). */
const CARD_IMAGE_BLEED_CLASS = 'origin-center scale-x-[1.05] scale-y-[1.11]';

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
}> = ({ id, title, children, isOver, className = '', layout = 'category', placedCount = 0 }) => {
  const { setNodeRef } = useDroppable({ id });
  const shell = `rounded-3xl border-2 transition-colors ${
    isOver ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200 bg-white/50'
  } ${className}`;

  if (layout === 'deck') {
    return (
      <div ref={setNodeRef} className={shell}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex h-full min-h-0 max-h-full flex-col overflow-visible p-4 ${shell}`}
      style={{ minWidth: categoryShellMinWidth(placedCount) }}
    >
      <h3 className="mb-3 shrink-0 text-center text-lg font-semibold text-slate-700">{title}</h3>
      <div className="min-h-0 flex-1 overflow-visible">
        <div
          className="box-border flex w-max flex-col flex-wrap content-start items-start gap-4"
          style={{
            minWidth: colsMinWidthInner(placedCount),
            height: placedCount === 0 ? '7rem' : COLUMN_WRAP_HEIGHT,
            maxHeight: COLUMN_WRAP_HEIGHT,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

const SortableCard: React.FC<{ card: CardData, isDragging?: boolean, onClick?: () => void, isFlipped: boolean }> = ({ card, isDragging, onClick, isFlipped }) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: card.id,
    data: card,
  });

  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [frontImgOrient, setFrontImgOrient] = useState<'landscape' | 'portrait' | null>(null);
  const [backImgOrient, setBackImgOrient] = useState<'landscape' | 'portrait' | null>(null);
  const visibleImageUrl = (isFlipped ? card.backImage : card.frontImage)?.trim() || '';
  const canZoom = visibleImageUrl.length > 0;

  useEffect(() => {
    setZoomUrl(null);
  }, [isFlipped]);

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
        // Prevent drag from triggering click if they moved
        if (e.defaultPrevented) return;
        onClick?.();
      }}
      className={`relative h-36 w-48 shrink-0 cursor-grab active:cursor-grabbing [perspective:1000px] ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Two-layer flip: works when an ancestor uses transform: scale() (3D backface-hidden is flattened there). */}
      <div className="relative h-full w-full overflow-visible rounded-2xl shadow-[0_2px_10px_rgba(15,23,42,0.06),0_4px_20px_-4px_rgba(15,23,42,0.1)]">
        <motion.div
          aria-hidden={isFlipped}
          className="absolute inset-0 flex flex-col justify-end items-start overflow-visible rounded-2xl border-2 border-emerald-100 bg-white p-2"
          initial={false}
          animate={{
            opacity: isFlipped ? 0 : 1,
            rotateY: isFlipped ? 88 : 0,
            zIndex: isFlipped ? 0 : 1,
          }}
          transition={flipTransition}
          style={{
            transformOrigin: 'center center',
            pointerEvents: isFlipped ? 'none' : 'auto',
          }}
        >
          {card.frontImage && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div className="relative flex h-full min-h-0 w-full items-center justify-center p-2">
                <img
                  src={card.frontImage}
                  alt="Card front"
                  className={
                    frontImgOrient === 'landscape'
                      ? `h-full w-full min-h-0 object-cover object-center ${CARD_IMAGE_BLEED_CLASS}`
                      : `max-h-full max-w-full object-contain ${CARD_IMAGE_BLEED_CLASS}`
                  }
                  referrerPolicy="no-referrer"
                  onLoad={onFaceImgLoad('front')}
                />
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-black/20" />
              </div>
            </div>
          )}
          <div className="relative z-10 min-w-0 max-w-full text-left break-words font-medium text-slate-800 drop-shadow-sm bg-white/80 px-2 py-1 rounded-md">
            {card.frontText}
          </div>
        </motion.div>

        <motion.div
          aria-hidden={!isFlipped}
          className="absolute inset-0 flex flex-col justify-end items-start overflow-visible rounded-2xl border-2 border-amber-200 bg-amber-50 p-2"
          initial={false}
          animate={{
            opacity: isFlipped ? 1 : 0,
            rotateY: isFlipped ? 0 : -88,
            zIndex: isFlipped ? 1 : 0,
          }}
          transition={flipTransition}
          style={{
            transformOrigin: 'center center',
            pointerEvents: isFlipped ? 'auto' : 'none',
          }}
        >
          {card.backImage && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div className="relative flex h-full min-h-0 w-full items-center justify-center p-2">
                <img
                  src={card.backImage}
                  alt="Card back"
                  className={
                    backImgOrient === 'landscape'
                      ? `h-full w-full min-h-0 object-cover object-center ${CARD_IMAGE_BLEED_CLASS}`
                      : `max-h-full max-w-full object-contain ${CARD_IMAGE_BLEED_CLASS}`
                  }
                  referrerPolicy="no-referrer"
                  onLoad={onFaceImgLoad('back')}
                />
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-black/20" />
              </div>
            </div>
          )}
          <div className="relative z-10 min-w-0 max-w-full text-left break-words font-medium text-slate-800 drop-shadow-sm bg-white/80 px-2 py-1 rounded-md">
            {card.backText || 'No back text'}
          </div>
        </motion.div>

        {canZoom ? (
          <button
            type="button"
            aria-label="View full size image"
            className="group absolute top-1 right-1 z-30 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-transparent text-slate-800 transition-colors hover:text-emerald-700"
            onPointerDown={stopDragAndFlip}
            onClick={(e) => {
              stopDragAndFlip(e);
              setZoomUrl(visibleImageUrl);
            }}
          >
            <ZoomIn
              className="h-4 w-4 transition-[filter] duration-200 ease-out [filter:drop-shadow(0_0_1px_rgba(255,255,255,0.95))_drop-shadow(0_1px_3px_rgba(15,23,42,0.55))] group-hover:[filter:drop-shadow(0_0_1px_rgba(255,255,255,0.95))_drop-shadow(0_1px_3px_rgba(15,23,42,0.45))_drop-shadow(0_0_6px_rgba(16,185,129,0.55))_drop-shadow(0_0_12px_rgba(16,185,129,0.2))]"
              strokeWidth={2.25}
            />
          </button>
        ) : null}
      </div>
    </div>

    <Dialog open={zoomUrl != null} onOpenChange={(open) => !open && setZoomUrl(null)}>
      <DialogContent
        showCloseButton
        className="max-h-[92vh] w-auto max-w-[min(95vw,1200px)] overflow-auto border-slate-200 bg-white p-3 sm:max-w-[min(95vw,1200px)]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Full size image</DialogTitle>
          <DialogDescription>Expanded card image preview</DialogDescription>
        </DialogHeader>
        {zoomUrl ? (
          <img
            src={zoomUrl}
            alt=""
            className="mx-auto block max-h-[85vh] w-auto max-w-full object-contain rounded-md"
            referrerPolicy="no-referrer"
          />
        ) : null}
      </DialogContent>
    </Dialog>
    </>
  );
}

/**
 * Categories grow to natural width (extra card columns widen each box). When the combined
 * layout exceeds the viewport, the whole group scales down — no scrolling.
 */
function ScaledCategoriesRegion({ children, measureKey }: { children: React.ReactNode; measureKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ bw: 0, bh: 0, s: 1 });

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

  const clipW = fit.bw > 0 ? fit.bw * fit.s : undefined;
  const clipH = fit.bh > 0 ? fit.bh * fit.s : undefined;

  return (
    <div
      ref={containerRef}
      className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start overflow-hidden"
    >
      {/* Side tracks absorb slack so wider categories use space from both viewport edges. */}
      <div className="min-h-0 min-w-0" aria-hidden />
      <div
        className="max-w-full min-w-0 overflow-hidden"
        style={
          clipW != null && clipH != null
            ? { width: clipW, height: clipH, maxWidth: '100%' }
            : { minHeight: '6rem' }
        }
      >
        <div
          ref={contentRef}
          className="flex w-max max-w-none flex-nowrap items-stretch gap-3"
          style={{
            transform: `scale(${fit.s})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
      <div className="min-h-0 min-w-0" aria-hidden />
    </div>
  );
}

const BG_IMAGE_OPACITY = 0.2;

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

  const baseClass = variant === 'welcome' ? 'bg-emerald-50/30' : 'bg-[#f5f7f5]';
  return (
    <div
      className={`relative ${variant === 'play' ? 'h-svh max-h-svh overflow-hidden' : 'min-h-screen'} ${baseClass}`}
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
            ? 'relative z-[1] flex h-svh max-h-svh min-h-0 flex-col overflow-hidden'
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
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [showResultDialog, setShowResultDialog] = useState(false);
  const [resultData, setResultData] = useState<{
    incorrectCount: number;
    /** Per-card class % correct (same order as activity.cards); null if not loaded or showScore off */
    cardClassPercents: { cardId: string; label: string; percent: number }[] | null;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  );

  /** Must run every render (before any conditional return) — used only on the play screen. */
  const categoryLayoutKey = useMemo(() => {
    if (!activity) return '';
    return activity.categories
      .map((c) => `${c}:${activity.cards.filter((x) => placements[x.id] === c).length}`)
      .join('|');
  }, [activity, placements]);

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

  const handleFlip = (id: string) => {
    setFlippedCards(prev => ({
      ...prev,
      [id]: !prev[id]
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
  };

  const handleSubmit = async () => {
    if (!activity) return;
    
    // Check if all cards are placed
    const unplaced = Object.values(placements).filter(p => p === 'deck').length;
    if (unplaced > 0) {
      toast.error(`Please place all cards. ${unplaced} remaining.`);
      return;
    }

    let correctCount = 0;
    let incorrectCount = 0;

    activity.cards.forEach(card => {
      if (placements[card.id] === card.correctCategory) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    });

    const score = Math.round((correctCount / activity.cards.length) * 100);

    try {
      await addDoc(collection(db, `activities/${activity.id}/responses`), {
        studentName,
        placements,
        score,
        submittedAt: serverTimestamp()
      });

      let cardClassPercents: { cardId: string; label: string; percent: number }[] | null = null;
      if (activity.showScore) {
        try {
          const snap = await getDocs(collection(db, `activities/${activity.id}/responses`));
          const resps = snap.docs.map((d) => d.data() as { placements?: Record<string, string> });
          const n = resps.length;
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

      setResultData({ incorrectCount, cardClassPercents });
      setShowResultDialog(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `activities/${activity.id}/responses`);
      toast.error('Failed to submit response');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!activity) return <div className="p-8 text-center">Activity not found</div>;

  const tryStartActivity = () => {
    if (studentName.trim()) setHasStarted(true);
    else toast.error('Please enter your name');
  };

  if (!hasStarted) {
    return (
      <ActivityShell backgroundImage={activity.backgroundImage} variant="welcome">
      <div className="flex flex-1 items-center justify-center p-4">
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
    );
  }

  const activeCard = activeId ? activity.cards.find(c => c.id === activeId) : null;

  return (
    <ActivityShell backgroundImage={activity.backgroundImage} variant="play">
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="z-10 flex shrink-0 justify-between bg-white px-4 py-3 shadow-sm sm:px-6 sm:py-4">
        <div>
          <h1 className="text-xl font-bold text-emerald-500">{activity.title}</h1>
          <p className="text-sm text-slate-500">Student: {studentName}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset} className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            <RotateCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
          <Button onClick={handleSubmit} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-md">
            <CheckCircle2 className="w-4 h-4 mr-2" /> Submit
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-0 pt-2 sm:px-5 sm:pt-3">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Categories: fills all space above the pinned deck */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-0.5 py-0.5">
              <ScaledCategoriesRegion measureKey={categoryLayoutKey}>
                {activity.categories.map((cat) => {
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

            {/* Deck: pinned to bottom of viewport (flex sibling below flex-1 categories) */}
            <div className="shrink-0 border-t border-slate-200/90 bg-[#f5f7f5]/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-4px_rgba(15,23,42,0.08)] backdrop-blur-sm">
              <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:text-sm">
                Unsorted Cards
              </h3>
              <DroppableCategory id="deck" title="" layout="deck" isOver={activeCategory === 'deck'}>
                <div className="flex min-h-[140px] max-h-[40vh] flex-wrap content-start justify-center gap-3 overflow-y-auto rounded-2xl border-2 border-dashed border-slate-300 bg-white/50 p-3 sm:min-h-[160px] sm:gap-4 sm:rounded-3xl sm:p-4">
                  {activity.cards.filter(c => placements[c.id] === 'deck').map(card => (
                    <SortableCard
                      key={card.id}
                      card={card}
                      isFlipped={!!flippedCards[card.id]}
                      onClick={() => handleFlip(card.id)}
                    />
                  ))}
                  {activity.cards.filter(c => placements[c.id] === 'deck').length === 0 && (
                    <div className="flex min-h-[6rem] w-full items-center justify-center text-slate-400">All cards sorted!</div>
                  )}
                </div>
              </DroppableCategory>
            </div>
          </div>

          <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
            {activeCard ? (
              <SortableCard card={activeCard} isDragging isFlipped={!!flippedCards[activeCard.id]} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="rounded-3xl sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl text-center">Activity Complete!</DialogTitle>
            <DialogDescription className="text-center text-lg pt-4">
              {activity.checkAnswers && resultData && resultData.incorrectCount > 0 ? (
                <span className="text-amber-600 font-medium">
                  You have {resultData.incorrectCount} incorrect card{resultData.incorrectCount > 1 ? 's' : ''}.
                </span>
              ) : activity.checkAnswers && resultData && resultData.incorrectCount === 0 ? (
                <span className="text-emerald-600 font-medium">
                  Perfect! All cards are in the correct category.
                </span>
              ) : (
                <span>Your response has been recorded.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {activity.showScore && resultData?.cardClassPercents && resultData.cardClassPercents.length > 0 && (
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
          )}
          {activity.showScore && resultData?.cardClassPercents && resultData.cardClassPercents.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-500">No class data yet.</p>
          )}

          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setShowResultDialog(false)} className="rounded-full px-8 bg-slate-900 text-white hover:bg-slate-800">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ActivityShell>
  );
}

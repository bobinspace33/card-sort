import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Activity, CardData } from '../types';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RotateCcw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

const DroppableCategory: React.FC<{
  id: string;
  title: string;
  children: React.ReactNode;
  isOver: boolean;
  className?: string;
  /** Categories use a fixed max height and wrap cards into extra columns; deck is a loose drop zone. */
  layout?: 'category' | 'deck';
}> = ({ id, title, children, isOver, className = '', layout = 'category' }) => {
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
    <div ref={setNodeRef} className={`flex h-full min-h-0 max-h-full flex-col overflow-hidden p-4 ${shell}`}>
      <h3 className="mb-3 shrink-0 text-center text-lg font-semibold text-slate-700">{title}</h3>
      {/* Column flex + wrap: height comes from flex layout above the pinned deck. */}
      <div className="min-h-0 flex-1 overflow-visible">
        <div className="box-border flex h-full max-h-full min-h-[7rem] w-max flex-col flex-wrap content-start items-start gap-4">
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

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 50 : 1,
  } : undefined;

  return (
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
      className={`relative h-36 w-48 shrink-0 cursor-grab active:cursor-grabbing perspective-1000 ${isDragging ? 'opacity-50' : ''}`}
    >
      <motion.div
        className="relative h-full w-full preserve-3d rounded-2xl shadow-[0_2px_10px_rgba(15,23,42,0.06),0_4px_20px_-4px_rgba(15,23,42,0.1)]"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.4, type: "spring", stiffness: 260, damping: 20 }}
      >
        {/* Front */}
        <div className="absolute h-full w-full backface-hidden overflow-hidden rounded-2xl border-2 border-emerald-100 bg-white flex flex-col items-center justify-center p-2">
          {card.frontImage && (
            <div className="w-full h-full absolute inset-0">
              <img src={card.frontImage} alt="Card front" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-black/20" />
            </div>
          )}
          <div className="relative z-10 text-center font-medium text-slate-800 drop-shadow-sm bg-white/80 px-2 py-1 rounded-lg">
            {card.frontText}
          </div>
        </div>

        {/* Back */}
        <div className="absolute h-full w-full backface-hidden overflow-hidden rounded-2xl border-2 border-amber-200 bg-amber-50 flex flex-col items-center justify-center p-2 [transform:rotateY(180deg)]">
          {card.backImage && (
            <div className="w-full h-full absolute inset-0">
              <img src={card.backImage} alt="Card back" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-black/20" />
            </div>
          )}
          <div className="relative z-10 text-center font-medium text-slate-800 drop-shadow-sm bg-white/80 px-2 py-1 rounded-lg">
            {card.backText || "No back text"}
          </div>
        </div>
      </motion.div>
    </div>
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
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 items-start justify-center overflow-hidden">
      <div
        className="overflow-hidden"
        style={
          clipW != null && clipH != null
            ? { width: clipW, height: clipH, maxWidth: '100%' }
            : { minHeight: '6rem', width: '100%' }
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
  const baseClass = variant === 'welcome' ? 'bg-emerald-50/30' : 'bg-[#f5f7f5]';
  return (
    <div
      className={`relative ${variant === 'play' ? 'h-svh max-h-svh overflow-hidden' : 'min-h-screen'} ${baseClass}`}
    >
      {url ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${url})`, opacity: 0.3 }}
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
  const [resultData, setResultData] = useState<{ score: number, incorrectCount: number } | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
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
    setResultData({ score, incorrectCount });

    try {
      await addDoc(collection(db, `activities/${activity.id}/responses`), {
        studentName,
        placements,
        score,
        submittedAt: serverTimestamp()
      });
      setIsSubmitted(true);
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
            <CardTitle className="text-3xl font-bold text-emerald-800">{activity.title}</CardTitle>
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

  const categoryLayoutKey = useMemo(
    () =>
      activity.categories
        .map((c) => `${c}:${activity.cards.filter((x) => placements[x.id] === c).length}`)
        .join('|'),
    [activity.cards, activity.categories, placements],
  );

  return (
    <ActivityShell backgroundImage={activity.backgroundImage} variant="play">
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="z-10 flex shrink-0 justify-between bg-white px-4 py-3 shadow-sm sm:px-6 sm:py-4">
        <div>
          <h1 className="text-xl font-bold text-emerald-900">{activity.title}</h1>
          <p className="text-sm text-slate-500">Student: {studentName}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset} disabled={isSubmitted} className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            <RotateCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitted} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-md">
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
                {activity.categories.map((cat) => (
                  <div
                    key={cat}
                    className="flex h-full max-h-full min-h-0 min-w-[10rem] max-w-none shrink-0 self-stretch overflow-visible sm:min-w-[11rem]"
                  >
                    <DroppableCategory id={cat} title={cat} isOver={activeCategory === cat} className="w-max max-w-none">
                      {activity.cards
                        .filter((c) => placements[c.id] === cat)
                        .map((card) => (
                          <SortableCard
                            key={card.id}
                            card={card}
                            isFlipped={!!flippedCards[card.id]}
                            onClick={() => handleFlip(card.id)}
                          />
                        ))}
                    </DroppableCategory>
                  </div>
                ))}
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
          
          {activity.showScore && resultData && (
            <div className="py-8 flex justify-center">
              <div className="text-center">
                <div className="text-6xl font-light text-emerald-500">{resultData.score}%</div>
                <div className="text-sm text-slate-500 mt-2 uppercase tracking-widest font-semibold">Final Score</div>
              </div>
            </div>
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

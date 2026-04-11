import React, { useEffect, useState } from 'react';
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
import { motion, AnimatePresence } from 'motion/react';

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
    <div ref={setNodeRef} className={`flex h-full min-h-0 max-h-full flex-col p-4 ${shell}`}>
      <h3 className="mb-3 shrink-0 text-center text-lg font-semibold text-slate-700">{title}</h3>
      {/* Column-direction flex + wrap + bounded height → new columns to the right as cards fill vertical space */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch]">
        <div className="flex h-full max-h-full w-max flex-col flex-wrap content-start items-start gap-4">
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
        className="w-full h-full relative preserve-3d"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.4, type: "spring", stiffness: 260, damping: 20 }}
      >
        {/* Front */}
        <div className="absolute w-full h-full backface-hidden rounded-2xl overflow-hidden shadow-md bg-white border-2 border-emerald-100 flex flex-col items-center justify-center p-2">
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
        <div className="absolute w-full h-full backface-hidden rounded-2xl overflow-hidden shadow-md bg-amber-50 border-2 border-amber-200 flex flex-col items-center justify-center p-2 [transform:rotateY(180deg)]">
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
    <div className={`relative min-h-screen ${baseClass}`}>
      {url ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${url})`, opacity: 0.3 }}
        />
      ) : null}
      <div className="relative z-[1] min-h-screen flex flex-col">{children}</div>
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
              placeholder="Your Name"
              className="rounded-xl text-lg p-6"
            />
            <Button 
              onClick={() => {
                if (studentName.trim()) setHasStarted(true);
                else toast.error('Please enter your name');
              }} 
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
    <div className="flex flex-col flex-1 min-h-0">
      <header className="bg-white px-6 py-4 shadow-sm flex justify-between items-center z-10">
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

      <main className="flex flex-1 min-h-0 flex-col overflow-hidden p-4 sm:p-6">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="flex min-h-0 flex-1 flex-col gap-6">
            {/* Categories: centered row; height bounded by flex layout; each category grows wider as cards wrap into extra columns */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex h-full min-h-0 flex-1 overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch]">
                <div className="flex h-full min-h-0 min-w-full justify-center px-1 py-1">
                  <div className="flex h-full max-h-full w-max items-stretch gap-4">
                  {activity.categories.map((cat) => (
                    <div
                      key={cat}
                      className="flex h-full max-h-full min-h-0 min-w-[12.5rem] shrink-0 self-stretch sm:min-w-[13rem]"
                    >
                      <DroppableCategory id={cat} title={cat} isOver={activeCategory === cat} className="w-full">
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
                  </div>
                </div>
              </div>
            </div>

            {/* Deck Area */}
            <div className="shrink-0">
              <h3 className="mb-4 px-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Unsorted Cards</h3>
              <DroppableCategory id="deck" title="" layout="deck" isOver={activeCategory === 'deck'}>
                <div className="flex min-h-[160px] flex-wrap content-start justify-center gap-4 rounded-3xl border-2 border-dashed border-slate-300 bg-white/40 p-4">
                  {activity.cards.filter(c => placements[c.id] === 'deck').map(card => (
                    <SortableCard
                      key={card.id}
                      card={card}
                      isFlipped={!!flippedCards[card.id]}
                      onClick={() => handleFlip(card.id)}
                    />
                  ))}
                  {activity.cards.filter(c => placements[c.id] === 'deck').length === 0 && (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">All cards sorted!</div>
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

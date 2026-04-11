import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { auth, db, storage } from '../firebase';
import { collection, addDoc, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, type UploadMetadata } from 'firebase/storage';
import { CardData } from '../types';
import { EDITOR_PATH } from '../lib/paths';
import { allocateUniqueStudentCode } from '../lib/studentCode';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, Plus, Save, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function CreateActivity() {
  const navigate = useNavigate();
  const { activityId } = useParams<{ activityId: string }>();
  const isEditMode = Boolean(activityId);

  const [title, setTitle] = useState('');
  const [categories, setCategories] = useState<string[]>(['Category 1', 'Category 2']);
  const [cards, setCards] = useState<CardData[]>([]);
  const [checkAnswers, setCheckAnswers] = useState(true);
  const [showScore, setShowScore] = useState(true);
  const [backgroundImage, setBackgroundImage] = useState('');
  const [bulkCardCount, setBulkCardCount] = useState('');
  const [saving, setSaving] = useState(false);
  /** Firestore fields that must stay unchanged on update (see firestore.rules). */
  const [editCreatedAt, setEditCreatedAt] = useState<unknown>(null);
  const [editOwnerId, setEditOwnerId] = useState<string | null>(null);
  /** Shown when editing; assigned on first save if missing (legacy activities). */
  const [studentCode, setStudentCode] = useState('');
  const [bootstrapping, setBootstrapping] = useState(isEditMode);

  const MAX_CARDS = 100;

  useEffect(() => {
    if (!activityId) {
      setBootstrapping(false);
      return;
    }

    let cancelled = false;
    setBootstrapping(true);

    void (async () => {
      try {
        await auth.authStateReady();
        if (cancelled) return;
        const user = auth.currentUser;
        if (!user) {
          toast.error('Sign in to edit activities');
          navigate(EDITOR_PATH, { replace: true });
          return;
        }
        const snap = await getDoc(doc(db, 'activities', activityId));
        if (cancelled) return;
        if (!snap.exists()) {
          toast.error('Activity not found');
          navigate(EDITOR_PATH, { replace: true });
          return;
        }
        const data = snap.data();
        if (data.ownerId !== user.uid) {
          toast.error('You can only edit your own activities');
          navigate(EDITOR_PATH, { replace: true });
          return;
        }
        setTitle(typeof data.title === 'string' ? data.title : '');
        const cats = Array.isArray(data.categories) ? (data.categories as string[]) : [];
        setCategories(cats.length >= 2 ? cats : ['Category 1', 'Category 2']);
        const firstCat = (cats.length >= 2 ? cats : ['Category 1', 'Category 2'])[0] ?? '';
        const rawCards = Array.isArray(data.cards) ? data.cards : [];
        setCards(
          rawCards.map((c: Record<string, unknown>) => ({
            id: typeof c.id === 'string' && c.id ? c.id : uuidv4(),
            frontText: typeof c.frontText === 'string' ? c.frontText : '',
            frontImage: typeof c.frontImage === 'string' ? c.frontImage : '',
            backText: typeof c.backText === 'string' ? c.backText : '',
            backImage: typeof c.backImage === 'string' ? c.backImage : '',
            correctCategory: typeof c.correctCategory === 'string' ? c.correctCategory : firstCat,
          })),
        );
        setCheckAnswers(Boolean(data.checkAnswers));
        setShowScore(Boolean(data.showScore));
        setBackgroundImage(typeof data.backgroundImage === 'string' ? data.backgroundImage : '');
        setEditCreatedAt(data.createdAt);
        setEditOwnerId(typeof data.ownerId === 'string' ? data.ownerId : null);
        const sc = data.studentCode;
        setStudentCode(typeof sc === 'string' && /^[A-Z0-9]{6}$/i.test(sc) ? sc.toUpperCase() : '');
      } catch (e) {
        console.error('Load activity for edit:', e);
        toast.error('Could not load activity');
        navigate(EDITOR_PATH, { replace: true });
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activityId, navigate]);

  const makeEmptyCard = (): CardData => ({
    id: uuidv4(),
    frontText: '',
    frontImage: '',
    backText: '',
    backImage: '',
    correctCategory: categories[0] || '',
  });

  const handleAddCategory = () => {
    if (categories.length >= 10) {
      toast.error('Maximum 10 categories allowed');
      return;
    }
    setCategories([...categories, `Category ${categories.length + 1}`]);
  };

  const handleUpdateCategory = (index: number, value: string) => {
    const newCats = [...categories];
    newCats[index] = value;
    setCategories(newCats);
  };

  const handleRemoveCategory = (index: number) => {
    if (categories.length <= 2) {
      toast.error('Must have at least 2 categories');
      return;
    }
    const newCats = categories.filter((_, i) => i !== index);
    setCategories(newCats);
  };

  const handleAddCard = () => {
    if (cards.length >= MAX_CARDS) {
      toast.error(`Maximum ${MAX_CARDS} cards allowed`);
      return;
    }
    setCards([...cards, makeEmptyCard()]);
  };

  const handleAddBulkCards = () => {
    const n = parseInt(bulkCardCount, 10);
    if (Number.isNaN(n) || n < 1) {
      toast.error('Enter a number of cards to add (1 or more)');
      return;
    }
    if (n > MAX_CARDS) {
      toast.error(`You can add at most ${MAX_CARDS} cards at once`);
      return;
    }
    const room = MAX_CARDS - cards.length;
    if (room <= 0) {
      toast.error(`Maximum ${MAX_CARDS} cards allowed`);
      return;
    }
    const add = Math.min(n, room);
    if (add < n) {
      toast.message(`Only ${add} cards added (limit ${MAX_CARDS} total)`);
    }
    const newCards = Array.from({ length: add }, () => makeEmptyCard());
    setCards((prev) => [...prev, ...newCards]);
    setBulkCardCount('');
  };

  const handleUpdateCard = (id: string, field: keyof CardData, value: string) => {
    setCards(cards.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleRemoveCard = (id: string) => {
    setCards(cards.filter((c) => c.id !== id));
  };

  /** Storage rules require image/*; empty file.type breaks rules and some browsers omit it. */
  function imageContentType(file: File): string {
    if (file.type && file.type.startsWith('image/')) return file.type;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
      heic: 'image/heic',
    };
    return map[ext] ?? 'image/jpeg';
  }

  const handleBackgroundImageUpload = async (file: File) => {
    if (!auth.currentUser) {
      toast.error('You must be logged in to upload images');
      return;
    }
    const toastId = toast.loading('Uploading background…');
    try {
      const storageRef = ref(storage, `images/${auth.currentUser.uid}/bg_${uuidv4()}_${file.name}`);
      const metadata: UploadMetadata = { contentType: imageContentType(file) };
      await uploadBytes(storageRef, file, metadata);
      const url = await getDownloadURL(storageRef);
      setBackgroundImage(url);
      toast.success('Background image uploaded', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Background upload failed', { id: toastId });
    }
  };

  const handleImageUpload = async (cardId: string, field: 'frontImage' | 'backImage', file: File) => {
    if (!auth.currentUser) {
      toast.error('You must be logged in to upload images');
      return;
    }
    const toastId = toast.loading('Uploading image...');
    try {
      const storageRef = ref(storage, `images/${auth.currentUser.uid}/${uuidv4()}_${file.name}`);
      const metadata: UploadMetadata = { contentType: imageContentType(file) };
      await uploadBytes(storageRef, file, metadata);
      const url = await getDownloadURL(storageRef);
      handleUpdateCard(cardId, field, url);
      toast.success('Image uploaded!', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error(
        'Image upload failed. If the console shows a CORS error, apply storage rules to your bucket (see storage-cors.json + README) and confirm storageBucket in firebase-applet-config.json matches Firebase → Project settings.',
        { id: toastId, duration: 12_000 },
      );
    }
  };

  const handleSave = async () => {
    if (!auth.currentUser) {
      toast.error('You must be logged in to save');
      return;
    }
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (categories.some((c) => !c.trim())) {
      toast.error('Categories cannot be empty');
      return;
    }
    if (cards.length === 0) {
      toast.error('Please add at least one card');
      return;
    }
    if (cards.some((c) => !c.frontText.trim() && !c.frontImage.trim())) {
      toast.error('All cards must have front text or an image');
      return;
    }

    setSaving(true);
    try {
      if (isEditMode && activityId) {
        if (!editOwnerId || editCreatedAt == null) {
          toast.error('Activity is still loading — try again in a moment');
          return;
        }
        let sc = studentCode.trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(sc)) {
          sc = await allocateUniqueStudentCode(db);
          setStudentCode(sc);
        }
        // Omit ownerId/createdAt so Firestore keeps existing values — resending Timestamp
        // objects can fail rules equality (request.resource.data.createdAt == resource.data.createdAt).
        await updateDoc(doc(db, 'activities', activityId), {
          title,
          categories,
          cards,
          checkAnswers,
          showScore,
          backgroundImage: backgroundImage.trim(),
          studentCode: sc,
        });
        toast.success('Activity updated');
        navigate(EDITOR_PATH, { replace: true });
        return;
      }

      const scNew = await allocateUniqueStudentCode(db);
      const docRef = await addDoc(collection(db, 'activities'), {
        title,
        categories,
        cards,
        checkAnswers,
        showScore,
        backgroundImage: backgroundImage.trim(),
        ownerId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        studentCode: scNew,
      });
      navigate(EDITOR_PATH, {
        replace: true,
        state: { createdActivityId: docRef.id, createdStudentCode: scNew },
      });
    } catch (error) {
      console.error(isEditMode ? 'Update activity:' : 'Create activity:', error);
      toast.error(
        'Could not save (Firestore permission denied). In Firebase Console → Firestore Database → Rules, paste the rules from firestore.rules in this project and click Publish.',
        { duration: 14_000 },
      );
    } finally {
      setSaving(false);
    }
  };

  if (bootstrapping) {
    return (
      <div className="max-w-4xl mx-auto p-6 md:p-12 flex flex-col items-center justify-center min-h-[40vh] text-slate-600">
        <p className="text-lg">Loading activity…</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-12">
      <div className="flex items-center mb-8">
        <Button variant="ghost" onClick={() => navigate(EDITOR_PATH)} className="mr-4 rounded-full w-10 h-10 p-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-3xl font-bold text-emerald-900">{isEditMode ? 'Edit Card Sort' : 'Create Card Sort'}</h1>
      </div>

      <div className="space-y-8">
        <Card className="rounded-3xl border-0 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-xl">General Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Activity Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Biology Classification"
                className="rounded-xl"
              />
            </div>

            {isEditMode ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                <Label className="text-emerald-900">Student code</Label>
                <p className="mt-1 font-mono text-xl font-semibold tracking-widest text-emerald-800">
                  {studentCode || '— will be assigned when you save —'}
                </p>
                <p className="mt-1 text-xs text-emerald-700/80">
                  Students enter this on the home page under Student Code (6 characters).
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                A unique 6-character student code is created when you save. Students can use it on the home page instead of a link.
              </p>
            )}

            <div className="space-y-2">
              <Label>Background image (optional)</Label>
              <p className="text-sm text-slate-500">Shown behind the student activity at 30% opacity.</p>
              <div className="flex gap-2 items-center flex-wrap">
                <ImageIcon className="w-5 h-5 text-slate-400 shrink-0" />
                <Input
                  value={backgroundImage}
                  onChange={(e) => setBackgroundImage(e.target.value)}
                  placeholder="https://… or upload"
                  className="rounded-xl flex-1 min-w-[12rem]"
                />
                <div className="relative">
                  <Input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleBackgroundImageUpload(e.target.files[0]);
                    }}
                  />
                  <Button type="button" variant="outline" className="rounded-xl">
                    Upload
                  </Button>
                </div>
              </div>
              {backgroundImage.trim() ? (
                <div className="mt-2 rounded-xl border border-slate-200 overflow-hidden max-w-xs aspect-video bg-slate-100 relative">
                  <img src={backgroundImage} alt="" className="w-full h-full object-cover opacity-30" />
                  <span className="absolute bottom-2 left-2 text-[10px] font-medium text-slate-600 bg-white/90 px-2 py-0.5 rounded">
                    Preview at 30% opacity
                  </span>
                </div>
              ) : null}
            </div>
            
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
              <div className="space-y-0.5">
                <Label>Check Answers</Label>
                <p className="text-sm text-slate-500">Allow students to see if they are correct</p>
              </div>
              <Switch checked={checkAnswers} onCheckedChange={setCheckAnswers} />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
              <div className="space-y-0.5">
                <Label>Show Score</Label>
                <p className="text-sm text-slate-500">Display final score after submission</p>
              </div>
              <Switch checked={showScore} onCheckedChange={setShowScore} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-0 shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl">Categories</CardTitle>
            <Button onClick={handleAddCategory} variant="outline" size="sm" className="rounded-full">
              <Plus className="w-4 h-4 mr-2" /> Add Category
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {categories.map((cat, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <Input
                  value={cat}
                  onChange={(e) => handleUpdateCategory(idx, e.target.value)}
                  className="rounded-xl"
                  placeholder={`Category ${idx + 1}`}
                />
                <Button variant="ghost" size="icon" onClick={() => handleRemoveCategory(idx)} className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-0 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-xl">Cards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="space-y-2">
                <Label htmlFor="bulk-cards">Add cards:</Label>
                <Input
                  id="bulk-cards"
                  type="number"
                  min={1}
                  max={MAX_CARDS}
                  inputMode="numeric"
                  value={bulkCardCount}
                  onChange={(e) => setBulkCardCount(e.target.value)}
                  placeholder="e.g. 10"
                  className="rounded-xl w-full sm:w-32"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddBulkCards}
                className="rounded-full shrink-0"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add multiple
              </Button>
              <p className="text-xs text-slate-500 sm:ml-auto sm:flex-1 sm:text-right w-full sm:w-auto">
                Up to {MAX_CARDS} cards total. Use <span className="font-medium">Add Card</span> below the last card for one at a time.
              </p>
            </div>

            {cards.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center space-y-6">
                <p className="text-slate-500">No cards added yet. Enter a number above or use Add Card.</p>
                <Button onClick={handleAddCard} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full">
                  <Plus className="w-4 h-4 mr-2" /> Add Card
                </Button>
              </div>
            )}
            {cards.map((card, idx) => {
              const isLast = idx === cards.length - 1;
              return (
              <div key={card.id} className="p-6 rounded-2xl border border-slate-100 bg-slate-50/50 relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveCard(card.id)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <h4 className="font-medium mb-4 text-slate-700">Card {idx + 1}</h4>
                
                <Tabs defaultValue="front" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4 rounded-xl">
                    <TabsTrigger value="front" className="rounded-lg">Front</TabsTrigger>
                    <TabsTrigger value="back" className="rounded-lg">Back</TabsTrigger>
                  </TabsList>
                  <TabsContent value="front" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Text</Label>
                      <Input
                        value={card.frontText}
                        onChange={(e) => handleUpdateCard(card.id, 'frontText', e.target.value)}
                        placeholder="Text on the front of the card"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Image (Upload or URL)</Label>
                      <div className="flex gap-2 items-center">
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                        <Input
                          value={card.frontImage}
                          onChange={(e) => handleUpdateCard(card.id, 'frontImage', e.target.value)}
                          placeholder="https://example.com/image.jpg"
                          className="rounded-xl flex-1"
                        />
                        <div className="relative">
                          <Input 
                            type="file" 
                            accept="image/*"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                handleImageUpload(card.id, 'frontImage', e.target.files[0]);
                              }
                            }}
                          />
                          <Button type="button" variant="outline" className="rounded-xl">Upload</Button>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="back" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Text (Optional)</Label>
                      <Input
                        value={card.backText}
                        onChange={(e) => handleUpdateCard(card.id, 'backText', e.target.value)}
                        placeholder="Text on the back of the card"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Image (Upload or URL)</Label>
                      <div className="flex gap-2 items-center">
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                        <Input
                          value={card.backImage}
                          onChange={(e) => handleUpdateCard(card.id, 'backImage', e.target.value)}
                          placeholder="https://example.com/image.jpg"
                          className="rounded-xl flex-1"
                        />
                        <div className="relative">
                          <Input 
                            type="file" 
                            accept="image/*"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                handleImageUpload(card.id, 'backImage', e.target.files[0]);
                              }
                            }}
                          />
                          <Button type="button" variant="outline" className="rounded-xl">Upload</Button>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="mt-6 space-y-2">
                  <Label>Correct Category</Label>
                  <select
                    className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={card.correctCategory}
                    onChange={(e) => handleUpdateCard(card.id, 'correctCategory', e.target.value)}
                  >
                    {categories.map((cat, i) => (
                      <option key={i} value={cat}>{cat || `Category ${i + 1}`}</option>
                    ))}
                  </select>
                </div>
                {isLast && (
                  <div className="mt-6 pt-5 border-t border-slate-200/90">
                    <Button
                      type="button"
                      onClick={handleAddCard}
                      className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white rounded-full"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Add Card
                    </Button>
                  </div>
                )}
              </div>
            );
            })}
          </CardContent>
        </Card>

        <div className="flex justify-end pt-4 pb-12">
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-8 py-6 text-lg shadow-lg">
            {saving ? (
              'Saving...'
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" /> {isEditMode ? 'Save changes' : 'Save Activity'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

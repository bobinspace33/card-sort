import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, storage, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { CardData } from '../types';
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
  const [title, setTitle] = useState('');
  const [categories, setCategories] = useState<string[]>(['Category 1', 'Category 2']);
  const [cards, setCards] = useState<CardData[]>([]);
  const [checkAnswers, setCheckAnswers] = useState(true);
  const [showScore, setShowScore] = useState(true);
  const [saving, setSaving] = useState(false);

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
    setCards([
      ...cards,
      {
        id: uuidv4(),
        frontText: '',
        frontImage: '',
        backText: '',
        backImage: '',
        correctCategory: categories[0] || '',
      },
    ]);
  };

  const handleUpdateCard = (id: string, field: keyof CardData, value: string) => {
    setCards(cards.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleRemoveCard = (id: string) => {
    setCards(cards.filter((c) => c.id !== id));
  };

  const handleImageUpload = async (cardId: string, field: 'frontImage' | 'backImage', file: File) => {
    if (!auth.currentUser) {
      toast.error('You must be logged in to upload images');
      return;
    }
    const toastId = toast.loading('Uploading image...');
    try {
      const storageRef = ref(storage, `images/${auth.currentUser.uid}/${uuidv4()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      handleUpdateCard(cardId, field, url);
      toast.success('Image uploaded!', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Failed to upload image', { id: toastId });
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
      const docRef = await addDoc(collection(db, 'activities'), {
        title,
        categories,
        cards,
        checkAnswers,
        showScore,
        ownerId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });
      navigate('/', { replace: true, state: { createdActivityId: docRef.id } });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'activities');
      toast.error('Failed to create activity');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-12">
      <div className="flex items-center mb-8">
        <Button variant="ghost" onClick={() => navigate('/')} className="mr-4 rounded-full w-10 h-10 p-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-3xl font-bold text-emerald-900">Create Card Sort</h1>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl">Cards</CardTitle>
            <Button onClick={handleAddCard} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full">
              <Plus className="w-4 h-4 mr-2" /> Add Card
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {cards.length === 0 && (
              <div className="text-center py-8 text-slate-500">No cards added yet.</div>
            )}
            {cards.map((card, idx) => (
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
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end pt-4 pb-12">
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-8 py-6 text-lg shadow-lg">
            {saving ? 'Saving...' : <><Save className="w-5 h-5 mr-2" /> Save Activity</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

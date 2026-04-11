import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { EDITOR_PATH } from '../lib/paths';
import { isValidStudentCodeFormat, normalizeStudentCodeInput } from '../lib/studentCode';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { LayoutGrid, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

export default function Landing() {
  const navigate = useNavigate();
  const [codeInput, setCodeInput] = useState('');
  const [lookingUp, setLookingUp] = useState(false);

  const joinWithCode = async () => {
    const code = normalizeStudentCodeInput(codeInput);
    if (!isValidStudentCodeFormat(code)) {
      toast.error('Enter a 6-character code (letters and numbers).');
      return;
    }
    setLookingUp(true);
    try {
      const q = query(collection(db, 'activities'), where('studentCode', '==', code), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        toast.error('No activity found for that code. Check with your teacher.');
        return;
      }
      const id = snap.docs[0]!.id;
      navigate(`/play/${id}`);
    } catch (e) {
      console.error(e);
      toast.error('Could not look up that code. Check your connection and try again.');
    } finally {
      setLookingUp(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-[#f5f7f5] px-4 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-emerald-900 sm:text-5xl">Sort-o-Matic 5000</h1>
        <p className="mt-3 max-w-md text-emerald-700/80">Teachers build sorts; students join with a code or link.</p>
      </div>

      <div className="flex w-full max-w-lg flex-col gap-6">
        <Link
          to={EDITOR_PATH}
          className={cn(
            buttonVariants({ variant: 'default' }),
            'h-auto min-h-[5.5rem] w-full flex-col gap-2 rounded-3xl bg-emerald-600 py-8 text-lg font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 sm:text-xl [&]:hover:text-white',
          )}
        >
          <LayoutGrid className="h-8 w-8 opacity-90" aria-hidden />
          Facilitator dashboard
          <span className="text-sm font-normal text-white/90">Sign in and manage activities</span>
        </Link>

        <div className="flex min-h-[5.5rem] w-full flex-col justify-center gap-4 rounded-3xl border-2 border-slate-200 bg-white p-8 shadow-md shadow-slate-200/50">
          <div className="flex flex-col items-center gap-1 text-center">
            <KeyRound className="h-8 w-8 text-emerald-700" aria-hidden />
            <h2 className="text-xl font-semibold text-slate-800">Student Code</h2>
            <p className="text-sm text-slate-500">Enter the 6-character code from your teacher.</p>
          </div>
          <Input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            value={codeInput}
            onChange={(e) => setCodeInput(normalizeStudentCodeInput(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void joinWithCode();
            }}
            placeholder="••••••"
            className="h-14 rounded-2xl border-slate-200 text-center font-mono text-2xl tracking-[0.35em] text-slate-900 placeholder:tracking-normal placeholder:text-slate-300"
            aria-label="Six character student code"
          />
          <Button
            type="button"
            onClick={() => void joinWithCode()}
            disabled={lookingUp}
            className="h-12 rounded-2xl bg-emerald-600 text-base font-semibold hover:bg-emerald-700"
          >
            {lookingUp ? 'Looking up…' : 'Join activity'}
          </Button>
        </div>
      </div>
    </div>
  );
}

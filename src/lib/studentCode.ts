import { collection, getDocs, limit, query, where, type Firestore } from 'firebase/firestore';

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Random 6-character code (avoids 0/O, 1/I/L for readability). */
export function generateStudentCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 6; i++) out += CHARSET[bytes[i]! % CHARSET.length]!;
  return out;
}

export function normalizeStudentCodeInput(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
}

export function isValidStudentCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

/** Reserves a code not already used on any activity document. */
export async function allocateUniqueStudentCode(db: Firestore): Promise<string> {
  for (let i = 0; i < 48; i++) {
    const code = generateStudentCode();
    const q = query(collection(db, 'activities'), where('studentCode', '==', code), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return code;
  }
  throw new Error('Could not allocate a unique student code');
}

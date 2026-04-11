import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import fileConfig from '../firebase-applet-config.json';

type FileConfig = typeof fileConfig & { firestoreDatabaseId?: string };

function resolveFirebaseOptions(): FirebaseOptions & { firestoreDatabaseId?: string } {
  const e = import.meta.env;
  if (e.VITE_FIREBASE_API_KEY && e.VITE_FIREBASE_PROJECT_ID && e.VITE_FIREBASE_APP_ID) {
    return {
      apiKey: e.VITE_FIREBASE_API_KEY,
      authDomain: e.VITE_FIREBASE_AUTH_DOMAIN ?? '',
      projectId: e.VITE_FIREBASE_PROJECT_ID,
      storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET ?? '',
      messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
      appId: e.VITE_FIREBASE_APP_ID,
      measurementId: e.VITE_FIREBASE_MEASUREMENT_ID || undefined,
      firestoreDatabaseId: e.VITE_FIREBASE_FIRESTORE_DATABASE_ID || (fileConfig as FileConfig).firestoreDatabaseId,
    };
  }
  return fileConfig as FileConfig;
}

const fullConfig = resolveFirebaseOptions();
const { firestoreDatabaseId, ...appOptions } = fullConfig;
const app = initializeApp(appOptions as FirebaseOptions);

/** Shown on sign-in troubleshooting UI so you can confirm the deployed app matches Firebase Console. */
export const firebaseProjectId = (app.options as FirebaseOptions).projectId ?? '';
export const firebaseAuthDomain = (app.options as FirebaseOptions).authDomain ?? '';
export const db =
  firestoreDatabaseId != null && firestoreDatabaseId !== ''
    ? getFirestore(app, firestoreDatabaseId)
    : getFirestore(app);
export const auth = getAuth(app);
void setPersistence(auth, browserLocalPersistence).catch(() => {
  /* ignore: some private modes reject persistence */
});

const storageBucket = (appOptions as FirebaseOptions).storageBucket;
/** Explicit gs:// bucket avoids some wrong-default bucket issues with newer *.firebasestorage.app names. */
export const storage =
  storageBucket && storageBucket.length > 0
    ? getStorage(app, `gs://${storageBucket.replace(/^gs:\/\//, '')}`)
    : getStorage(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

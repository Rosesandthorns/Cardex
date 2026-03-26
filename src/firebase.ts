import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// ── Initialise Firebase ────────────────────────────────────────────────────
console.log('[Firebase] Initialising Firebase app for project:', firebaseConfig.projectId);

let app: ReturnType<typeof initializeApp>;
let initError: Error | null = null;

try {
  app = initializeApp(firebaseConfig);
  console.log('[Firebase] ✅ Firebase app initialised successfully');
} catch (error) {
  initError = error instanceof Error ? error : new Error(String(error));
  console.error('[Firebase] ❌ Firebase app initialisation FAILED:', initError.message);
  // Re-export a dummy so that imports don't crash at module load time
  // The App component checks initError and shows the error screen
  throw initError;
}

export const auth = getAuth(app!);
export const db = getFirestore(app!, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

console.log(
  '[Firebase] Auth & Firestore ready. Database ID:',
  firebaseConfig.firestoreDatabaseId
);

// ── Auth Helpers ───────────────────────────────────────────────────────────
export const loginWithGoogle = async () => {
  console.log('[Firebase/Auth] Attempting Google sign-in popup...');
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log('[Firebase/Auth] ✅ Google sign-in succeeded. UID:', result.user.uid);
    return result;
  } catch (error) {
    console.error('[Firebase/Auth] ❌ Google sign-in failed:', error);
    throw error;
  }
};

export const logout = async () => {
  console.log('[Firebase/Auth] Signing out user:', auth.currentUser?.uid);
  try {
    await signOut(auth);
    console.log('[Firebase/Auth] ✅ Sign-out successful');
  } catch (error) {
    console.error('[Firebase/Auth] ❌ Sign-out failed:', error);
    throw error;
  }
};

// ── Firestore Error Handling ───────────────────────────────────────────────
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

/**
 * Logs a detailed Firestore error and re-throws it.
 * Always use this in onSnapshot / Firestore call error callbacks.
 * See guidelines.md for usage examples.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error(
    `[Firebase/Firestore] ❌ ${operationType.toUpperCase()} error on path "${path}":`,
    JSON.stringify(errInfo, null, 2)
  );
  throw new Error(JSON.stringify(errInfo));
}

// ── Connection Test ────────────────────────────────────────────────────────
async function testConnection() {
  console.log('[Firebase] Running Firestore connection test...');
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firebase] ✅ Firestore connection test passed');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error(
        '[Firebase] ❌ Firestore reports client is OFFLINE. ' +
          'Check your Firebase config in firebase-applet-config.json and network connectivity.'
      );
    } else if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
      // Expected for the test doc — connection itself is fine
      console.log('[Firebase] ✅ Firestore connection responsive (test doc permission-denied is expected)');
    } else {
      console.warn('[Firebase] ⚠️ Firestore connection test returned unexpected error:', error);
    }
  }
}

testConnection();

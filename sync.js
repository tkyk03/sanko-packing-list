import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.1.0';
const PUSH_DELAY_MS = 400;

let fb = null;
let handlers = null;
let currentUser = null;
let unsubscribeDoc = null;
let pending = null;
let pushTimer = null;

export async function initSync(callbacks) {
  handlers = callbacks;
  try {
    // Loaded lazily so the checklist still works offline or if the CDN is unreachable.
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    const db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
    });
    fb = { auth, db, authMod, fsMod };
    authMod.onAuthStateChanged(auth, handleUser);
    return true;
  } catch (e) {
    console.warn('Sync unavailable:', e);
    return false;
  }
}

function userDoc(uid) {
  return fb.fsMod.doc(fb.db, 'users', uid);
}

function handleUser(user) {
  unsubscribeDoc?.();
  unsubscribeDoc = null;
  currentUser = user;
  handlers.onUserChange(user);
  if (!user) return;
  unsubscribeDoc = fb.fsMod.onSnapshot(userDoc(user.uid), (snap) => {
    // Unsent local edits win; the server copy catches up once they are flushed.
    if (snap.metadata.hasPendingWrites || pending) return;
    if (snap.exists()) {
      const data = snap.data();
      if (data?.state) handlers.onRemoteState(data.state);
    } else if (!snap.metadata.fromCache) {
      pushState(handlers.getLocalState());
      flush();
    }
  }, (e) => handlers.onError(errorMessage(e)));
}

export function pushState(state) {
  if (!fb || !currentUser) return;
  pending = JSON.parse(JSON.stringify(state));
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flush, PUSH_DELAY_MS);
}

function flush() {
  clearTimeout(pushTimer);
  if (!pending || !currentUser) return;
  const { setDoc, serverTimestamp } = fb.fsMod;
  const state = pending;
  pending = null;
  setDoc(userDoc(currentUser.uid), { state, updatedAt: serverTimestamp() })
    .catch((e) => handlers.onError(errorMessage(e)));
}

addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});

export function isSyncReady() {
  return !!fb;
}

export async function signInWithGoogle() {
  const { GoogleAuthProvider, signInWithPopup } = fb.authMod;
  await signInWithPopup(fb.auth, new GoogleAuthProvider());
}

export async function signInWithEmail(email, password) {
  await fb.authMod.signInWithEmailAndPassword(fb.auth, email, password);
}

export async function signUpWithEmail(email, password) {
  await fb.authMod.createUserWithEmailAndPassword(fb.auth, email, password);
}

export async function signOutUser() {
  flush();
  await fb.authMod.signOut(fb.auth);
}

const MESSAGES = {
  'auth/popup-blocked': 'ポップアップがブロックされました。ブラウザの設定を確認するか、メールアドレスでログインしてください。',
  'auth/cancelled-popup-request': '',
  'auth/popup-closed-by-user': '',
  'auth/unauthorized-domain': 'このURLはFirebaseで許可されていません（承認済みドメインの設定を確認してください）。',
  'auth/operation-not-allowed': 'このログイン方法はFirebaseで有効になっていません。',
  'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
  'auth/invalid-credential': 'メールアドレスまたはパスワードが違います。',
  'auth/wrong-password': 'メールアドレスまたはパスワードが違います。',
  'auth/user-not-found': 'メールアドレスまたはパスワードが違います。',
  'auth/email-already-in-use': 'このメールアドレスは登録済みです。「ログイン」を押してください。',
  'auth/weak-password': 'パスワードは6文字以上にしてください。',
  'auth/too-many-requests': '試行回数が多すぎます。しばらく待ってからお試しください。',
  'auth/network-request-failed': '通信できませんでした。電波状況を確認してください。',
  'permission-denied': 'クラウドへの保存が拒否されました（Firestoreのルール設定を確認してください）。',
};

export function errorMessage(e) {
  const code = e?.code ?? '';
  if (code in MESSAGES) return MESSAGES[code];
  return `エラーが発生しました（${code || e?.message || '不明'}）`;
}

// js/firebase.js
// Firebase SDK — CDN compat version (v9 compat)
// Loaded via <script> tags in index.html before this file

(function() {

const firebaseConfig = {
  apiKey: "AIzaSyCSX_CA_pUdK7T1s8UGOTbLhOgDvu94mFA",
  authDomain: "aesthetic-sau-news.firebaseapp.com",
  projectId: "aesthetic-sau-news",
  storageBucket: "aesthetic-sau-news.firebasestorage.app",
  messagingSenderId: "1050052394157",
  appId: "1:1050052394157:web:b28ef3929ad5a09323da24",
  measurementId: "G-LQLGBQPVHR"
};

// Initialize Firebase (guard against double-init)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// ── Service references ──────────────────────────────────────────────────────
const db   = firebase.firestore();
const auth = firebase.auth();

// ── Firestore settings ──────────────────────────────────────────────────────
db.settings({ ignoreUndefinedProperties: true });

// ── Auth providers ──────────────────────────────────────────────────────────
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ── Helpers ─────────────────────────────────────────────────────────────────

async function signInWithGoogle() {
  return auth.signInWithPopup(googleProvider);
}

async function signOut() {
  return auth.signOut();
}

function getCurrentUser() {
  return auth.currentUser;
}

function onAuthStateChanged(callback) {
  return auth.onAuthStateChanged(callback);
}

async function isAdmin() {
  const user = auth.currentUser;
  if (!user) return false;
  const token = await user.getIdTokenResult();
  return token.claims.admin === true;
}

async function getDoc(collection, id) {
  const snap = await db.collection(collection).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function setDoc(collection, id, data, merge = true) {
  return db.collection(collection).doc(id).set(data, { merge });
}

async function addDoc(collection, data) {
  return db.collection(collection).add({
    ...data,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function updateDoc(collection, id, data) {
  return db.collection(collection).doc(id).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function deleteDoc(collection, id) {
  return db.collection(collection).doc(id).delete();
}

function increment(n) {
  return firebase.firestore.FieldValue.increment(n);
}

function serverTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

// ── Exports ──────────────────────────────────────────────────────────────────
window.SAU = window.SAU || {};
window.SAU.firebase = {
  db,
  auth,
  googleProvider,
  signInWithGoogle,
  signOut,
  getCurrentUser,
  onAuthStateChanged,
  isAdmin,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  increment,
  serverTimestamp
};

console.log('[SAU] Firebase initialized ✓ project:', firebaseConfig.projectId);

})(); // end IIFE

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCi7SG7IbzFWyJNU0GkdCio9i0-tHnC_CU",
  authDomain: "private-class-cerene.firebaseapp.com",
  projectId: "private-class-cerene",
  storageBucket: "private-class-cerene.firebasestorage.app",
  messagingSenderId: "749947935016",
  appId: "1:749947935016:web:63126e6684285fac70d81d",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

let storage = null;
try {
  storage = getStorage(app);
} catch (e) {
  console.warn("Firebase Storage 未啟用或初始化失敗", e);
}

export {
  auth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  db,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  runTransaction,
};
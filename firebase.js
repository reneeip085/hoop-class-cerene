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
  apiKey: "AIzaSyDqyeVGSWjd5vnVjhX5j2e89bkFPWuMKXg",
  authDomain: "hoop-class.firebaseapp.com",
  projectId: "hoop-class",
  storageBucket: "hoop-class.firebasestorage.app",
  messagingSenderId: "127999931742",
  appId: "1:127999931742:web:bd427ba5135dea85068bcf",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

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
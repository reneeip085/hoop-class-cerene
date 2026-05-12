import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Replace with your Firebase project credentials.
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

export {
  db,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
};

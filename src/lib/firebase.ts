
// Firebase project configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "resonanceai-gopeq.firebaseapp.com",
  projectId: "resonanceai-gopeq",
  storageBucket: "resonanceai-gopeq.appspot.com", // Corrected to .appspot.com as per standard Firebase naming
  messagingSenderId: "519097336176",
  appId: "1:519097336176:web:02f583e0cd7b654b1bcfb5"
  // measurementId is optional, so it can be omitted if not provided or needed
};

// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
// import { getAnalytics } from "firebase/analytics"; // Optional

// Initialize Firebase
let app: FirebaseApp;
let db: Firestore;
// let analytics; // Optional

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  // if (firebaseConfig.measurementId) { // Initialize analytics only if measurementId is present
  //   analytics = getAnalytics(app);
  // }
} else {
  app = getApps()[0];
  db = getFirestore(app);
  // if (firebaseConfig.measurementId) { // Initialize analytics only if measurementId is present
  //   analytics = getAnalytics(app);
  // }
}

export { app, db /*, analytics */ };

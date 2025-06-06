
// TODO: Replace with your actual Firebase project configuration
// You can get this from the Firebase console: Project settings > General > Your apps > Firebase SDK snippet > Config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID" // Optional, for Google Analytics
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
  // analytics = getAnalytics(app); // Optional
} else {
  app = getApps()[0];
  db = getFirestore(app);
  // analytics = getAnalytics(app); // Optional
}

export { app, db /*, analytics */ };

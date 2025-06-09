
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, 
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
// import { getAnalytics, type Analytics } from "firebase/analytics"; 

let app: FirebaseApp;
let db: Firestore;
// let analytics: Analytics | undefined;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  // if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  //   analytics = getAnalytics(app);
  // }
} else {
  app = getApps()[0];
  db = getFirestore(app);
  // if (typeof window !== 'undefined' && firebaseConfig.measurementId && !analytics) { // Ensure analytics is initialized only once
  //   analytics = getAnalytics(app);
  // }
}

export { app, db /*, analytics */ };

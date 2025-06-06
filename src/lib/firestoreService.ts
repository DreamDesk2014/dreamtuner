
'use client'; // This service might be called from client components

import { db } from './firebase'; // Your Firebase initialization
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

interface EventData {
  eventName: string;
  eventDetails?: Record<string, any>;
  timestamp?: Timestamp; // Firestore Timestamp for server-side stamping
  clientTimestamp?: Date; // Client-side Date object
  sessionId?: string; // Optional session identifier
  userId?: string; // Optional user identifier (if you add auth later)
}

/**
 * Logs an event to a specified Firestore collection.
 * @param collectionName The name of the Firestore collection.
 * @param data The event data to log.
 */
export async function logEvent(collectionName: string, data: Omit<EventData, 'timestamp'>): Promise<void> {
  if (!db) {
    console.error("Firestore is not initialized. Make sure Firebase config is correct.");
    return;
  }

  const eventDataToLog: EventData = {
    ...data,
    eventDetails: data.eventDetails || {},
    timestamp: serverTimestamp() as Timestamp,
    clientTimestamp: new Date(),
  };

  try {
    await addDoc(collection(db, collectionName), eventDataToLog);
    // console.log(`Event logged to '${collectionName}':`, eventDataToLog); // Keep console log minimal
  } catch (error) {
    console.error(`Error logging event to '${collectionName}': `, error);
  }
}

let currentSessionId: string | null = null;
export function getSessionId(): string {
  if (typeof window !== 'undefined') {
    if (!currentSessionId) {
      currentSessionId = sessionStorage.getItem('dreamTunerSessionId');
      if (!currentSessionId) {
        currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        sessionStorage.setItem('dreamTunerSessionId', currentSessionId);
      }
    }
    return currentSessionId;
  }
  return 'server_or_unknown_session';
}

// New function to save contact submissions
interface ContactSubmissionData {
  name?: string;
  email?: string;
  message?: string;
  sessionId: string;
  clientTimestamp: Date;
  timestamp?: Timestamp; // Will be set by serverTimestamp
}

export async function saveContactSubmission(data: Omit<ContactSubmissionData, 'timestamp'>): Promise<void> {
  if (!db) {
    console.error("Firestore is not initialized. Cannot save contact submission.");
    throw new Error("Firestore not available");
  }

  const submissionData: ContactSubmissionData = {
    ...data,
    timestamp: serverTimestamp() as Timestamp,
  };

  try {
    await addDoc(collection(db, 'contact_submissions'), submissionData);
    console.log("Contact submission saved:", submissionData);
  } catch (error) {
    console.error("Error saving contact submission: ", error);
    throw error; // Re-throw to be caught by the caller
  }
}

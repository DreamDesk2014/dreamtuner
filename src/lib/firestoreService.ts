
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
    // Potentially queue event or notify user, for now just log error
    return;
  }

  // Ensure eventDetails is always an object, even if undefined
  const eventDataToLog: EventData = {
    ...data,
    eventDetails: data.eventDetails || {},
    timestamp: serverTimestamp() as Timestamp, // Let Firestore set the server timestamp
    clientTimestamp: new Date(), // Also log client's perception of time
  };

  try {
    await addDoc(collection(db, collectionName), eventDataToLog);
    console.log(`Event logged to '${collectionName}':`, eventDataToLog);
  } catch (error) {
    console.error(`Error logging event to '${collectionName}': `, error);
    // Optionally, implement a retry mechanism or store locally for later upload
  }
}

// Example of how you might generate a simple session ID (client-side)
// This is very basic; for robust session tracking, consider more sophisticated methods.
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

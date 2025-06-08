
'use client'; // This service might be called from client components

import { db } from './firebase'; // Your Firebase initialization file path
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

import { getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { InstrumentConfigFirebase } from '../types'; // Assuming types is in ../types

const INSTRUMENT_COLLECTION = 'instrumentConfigs';

/**
 * Fetches a specific instrument configuration by its document ID.
 * @param instrumentId The Firestore document ID of the instrument config.
 * @returns The InstrumentConfigFirebase object or null if not found.
 */
export async function getInstrumentConfig(instrumentId: string): Promise<InstrumentConfigFirebase | null> {
  if (!db) {
    console.error("Firestore is not initialized. Cannot fetch instrument config.");
    return null;
  }

  try {
    const docRef = doc(db, INSTRUMENT_COLLECTION, instrumentId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as InstrumentConfigFirebase;
    } else {
      console.log(`No instrument config found with ID: ${instrumentId}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching instrument config with ID ${instrumentId}: `, error);
    return null;
  }
}

/**
 * Fetches instrument configurations that have a specific tag.
 * @param tag The tag to filter by.
 * @returns An array of InstrumentConfigFirebase objects or an empty array if none found.
 */
export async function getInstrumentConfigsByTag(tag: string): Promise<InstrumentConfigFirebase[]> {
  if (!db) {
    console.error("Firestore is not initialized. Cannot fetch instrument configs by tag.");
    return [];
  }

  try {
    const q = query(collection(db, INSTRUMENT_COLLECTION), where("tags", "array-contains", tag));
    const querySnapshot = await getDocs(q);

    const configs: InstrumentConfigFirebase[] = [];
    querySnapshot.forEach((doc) => {
      configs.push(doc.data() as InstrumentConfigFirebase);
    });
    return configs;
  } catch (error) {
    console.error(`Error fetching instrument configs by tag "${tag}": `, error);
    return [];
  }
}

/**
 * Fetches all instrument configurations from the collection.
 * @returns An array of all InstrumentConfigFirebase objects or an empty array if none found.
 */
export async function getAllInstrumentConfigs(): Promise<InstrumentConfigFirebase[]> {
  if (!db) {
    console.error("Firestore is not initialized. Cannot fetch all instrument configs.");
    return [];
  }

  try {
    const querySnapshot = await getDocs(collection(db, INSTRUMENT_COLLECTION));
    const configs: InstrumentConfigFirebase[] = [];
    querySnapshot.forEach((doc) => {
      configs.push(doc.data() as InstrumentConfigFirebase);
    });
    return configs;
  } catch (error) {
    console.error("Error fetching all instrument configs: ", error);
    return [];
  }
}

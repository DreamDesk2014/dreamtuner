
'use client'; // This service might be called from client components

import { db } from './firebase'; // Your Firebase initialization file path
import { collection, addDoc, serverTimestamp, Timestamp, getDocs, doc, getDoc, query, where, orderBy, limit } from 'firebase/firestore';
import type { InstrumentConfigFirebase, FirebaseSampleInstrument, AIPrompt, MasterMusicParameterSet, InputType } from '../types';

interface EventData {
  eventName: string;
  eventDetails?: Record<string, any>;
  timestamp?: Timestamp; // Firestore Timestamp for server-side stamping
  clientTimestamp?: Date; // Client-side Date object
  sessionId?: string; // Optional session identifier
  userId?: string; // Optional user identifier (if you add auth later)
}

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

interface ContactSubmissionData {
  name?: string;
  email?: string;
  message?: string;
  sessionId: string;
  clientTimestamp: Date;
  timestamp?: Timestamp;
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
  } catch (error) {
    console.error("Error saving contact submission: ", error);
    throw error;
  }
}

// For Synth Configurations (remains as is, distinct from Sample Instruments)
const INSTRUMENT_CONFIG_COLLECTION = 'instrumentConfigs';
export async function getInstrumentConfig(instrumentId: string): Promise<InstrumentConfigFirebase | null> {
  if (!db) return null;
  try {
    const docRef = doc(db, INSTRUMENT_CONFIG_COLLECTION, instrumentId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as InstrumentConfigFirebase : null;
  } catch (error) {
    console.error(`Error fetching instrument config ${instrumentId}: `, error);
    return null;
  }
}
export async function getInstrumentConfigsByTag(tag: string): Promise<InstrumentConfigFirebase[]> {
  if (!db) return [];
  try {
    const q = query(collection(db, INSTRUMENT_CONFIG_COLLECTION), where("tags", "array-contains", tag));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as InstrumentConfigFirebase);
  } catch (error) {
    console.error(`Error fetching instrument configs by tag "${tag}": `, error);
    return [];
  }
}
export async function getAllInstrumentConfigs(): Promise<InstrumentConfigFirebase[]> {
   if (!db) return [];
  try {
    const querySnapshot = await getDocs(collection(db, INSTRUMENT_CONFIG_COLLECTION));
    return querySnapshot.docs.map(doc => doc.data() as InstrumentConfigFirebase);
  } catch (error) {
    console.error("Error fetching all instrument configs: ", error);
    return [];
  }
}

// For Sample Instruments (Tone.Sampler definitions)
const SAMPLE_INSTRUMENTS_COLLECTION = 'sampleInstruments';
export async function getFirebaseSampleInstrumentById(id: string): Promise<FirebaseSampleInstrument | null> {
  if (!db) {
    console.error("Firestore is not initialized. Cannot fetch sample instrument.");
    return null;
  }
  try {
    const docRef = doc(db, SAMPLE_INSTRUMENTS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().isEnabled) {
      return { id: docSnap.id, ...docSnap.data() } as FirebaseSampleInstrument;
    } else {
      console.log(`Sample instrument not found or not enabled with ID: ${id}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching sample instrument with ID ${id}: `, error);
    return null;
  }
}
export async function getFirebaseSampleInstrumentsByCategory(category: string): Promise<FirebaseSampleInstrument[]> {
  if (!db) return [];
  try {
    const q = query(collection(db, SAMPLE_INSTRUMENTS_COLLECTION), where("category", "==", category), where("isEnabled", "==", true), orderBy("name"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirebaseSampleInstrument));
  } catch (error) {
    console.error(`Error fetching sample instruments by category "${category}": `, error);
    return [];
  }
}
export async function getAllFirebaseSampleInstruments(): Promise<FirebaseSampleInstrument[]> {
   if (!db) return [];
  try {
    const q = query(collection(db, SAMPLE_INSTRUMENTS_COLLECTION), where("isEnabled", "==", true), orderBy("name"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirebaseSampleInstrument));
  } catch (error) {
    console.error("Error fetching all sample instruments: ", error);
    return [];
  }
}

// For AI Prompts
const AI_PROMPTS_COLLECTION = 'aiPrompts';
interface AIPromptCriteria {
  genre?: string;
  mode?: 'standard' | 'kids';
  inputType?: InputType;
  variationKey?: string; // Specific variation requested
}
export async function getAIPrompt(criteria: AIPromptCriteria): Promise<AIPrompt | null> {
  if (!db) {
    console.error("Firestore is not initialized. Cannot fetch AI prompt.");
    return null;
  }
  try {
    const promptsRef = collection(db, AI_PROMPTS_COLLECTION);
    let q;

    // Attempt to find the most specific match first
    if (criteria.genre && criteria.variationKey) {
      q = query(promptsRef,
        where("genreTags", "array-contains", criteria.genre),
        where("variationKey", "==", criteria.variationKey),
        where("isEnabled", "==", true),
        orderBy("version", "desc"), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) return { promptId: snapshot.docs[0].id, ...snapshot.docs[0].data() } as AIPrompt;
    }

    if (criteria.genre && criteria.mode && criteria.inputType) {
       q = query(promptsRef,
        where("genreTags", "array-contains", criteria.genre),
        where("modeTags", "array-contains", criteria.mode),
        where("inputTypeTags", "array-contains", criteria.inputType),
        where("isEnabled", "==", true),
        orderBy("version", "desc"), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) return { promptId: snapshot.docs[0].id, ...snapshot.docs[0].data() } as AIPrompt;
    }

    if (criteria.genre && criteria.mode) {
       q = query(promptsRef,
        where("genreTags", "array-contains", criteria.genre),
        where("modeTags", "array-contains", criteria.mode),
        where("isEnabled", "==", true),
        orderBy("version", "desc"), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) return { promptId: snapshot.docs[0].id, ...snapshot.docs[0].data() } as AIPrompt;
    }

    if (criteria.genre) {
      q = query(promptsRef, where("genreTags", "array-contains", criteria.genre), where("isEnabled", "==", true), orderBy("version", "desc"), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) return { promptId: snapshot.docs[0].id, ...snapshot.docs[0].data() } as AIPrompt;
    }

    // Fallback to a global default prompt if any specific criteria were given but not matched
    if (criteria.genre || criteria.mode || criteria.inputType || criteria.variationKey) {
        q = query(promptsRef, where("variationKey", "==", "default_standard"), where("isEnabled", "==", true), orderBy("version", "desc"), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            console.log("Falling back to default_standard prompt for criteria:", criteria);
            return { promptId: snapshot.docs[0].id, ...snapshot.docs[0].data() } as AIPrompt;
        }
    }
    
    console.log("No specific or default AI prompt found for criteria:", criteria);
    return null;
  } catch (error) {
    console.error("Error fetching AI prompt: ", error);
    return null;
  }
}

// For Master Music Parameter Sets
const MASTER_PARAMETER_SETS_COLLECTION = 'masterMusicParameterSets';
interface MasterParamCriteria {
  setId?: string;
  genre?: string;
  mood?: string;
}
export async function getMasterMusicParameterSet(criteria: MasterParamCriteria): Promise<MasterMusicParameterSet | null> {
  if (!db) {
    console.error("Firestore is not initialized. Cannot fetch Master Music Parameter Set.");
    return null;
  }
  try {
    const setsRef = collection(db, MASTER_PARAMETER_SETS_COLLECTION);
    let q;

    if (criteria.setId) {
      const docRef = doc(db, MASTER_PARAMETER_SETS_COLLECTION, criteria.setId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().isEnabled) {
        return { setId: docSnap.id, ...docSnap.data() } as MasterMusicParameterSet;
      }
    }

    if (criteria.genre && criteria.mood) {
      q = query(setsRef,
        where("genreTags", "array-contains", criteria.genre),
        where("moodTags", "array-contains", criteria.mood),
        where("isEnabled", "==", true),
        orderBy("version", "desc"), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) return { setId: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MasterMusicParameterSet;
    }

    if (criteria.genre) {
      q = query(setsRef, where("genreTags", "array-contains", criteria.genre), where("isEnabled", "==", true), orderBy("version", "desc"), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) return { setId: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MasterMusicParameterSet;
    }

    // Fallback to a global default parameter set
    q = query(setsRef, where("name", "==", "Default Global Parameters"), where("isEnabled", "==", true), orderBy("version", "desc"), limit(1));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        console.log("Falling back to 'Default Global Parameters' set for criteria:", criteria);
        return { setId: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MasterMusicParameterSet;
    }

    console.log("No Master Music Parameter Set found for criteria:", criteria);
    return null;
  } catch (error) {
    console.error("Error fetching Master Music Parameter Set: ", error);
    return null;
  }
}

export async function getAllMasterMusicParameterSets(): Promise<MasterMusicParameterSet[]> {
   if (!db) return [];
  try {
    const q = query(collection(db, MASTER_PARAMETER_SETS_COLLECTION), where("isEnabled", "==", true), orderBy("name"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ setId: doc.id, ...doc.data() } as MasterMusicParameterSet));
  } catch (error) {
    console.error("Error fetching all Master Music Parameter Sets: ", error);
    return [];
  }
}

    
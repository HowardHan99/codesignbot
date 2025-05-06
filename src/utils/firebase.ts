'use client';

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, push, serverTimestamp, get, Database, query, orderByChild, equalTo, limitToLast, set } from 'firebase/database';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { firebaseConfig } from './config';
import { mergeSimilarPoints } from './textProcessing'

// Initialize Firebase only on the client side
let app: FirebaseApp | undefined;
let db: Database | null = null;

// Initialize Firebase lazily only when needed
export function getFirebaseDB() {
  if (!db) {
    try {
      if (!app) {
        app = initializeApp(firebaseConfig);
      }
      db = getDatabase(app);
    } catch (error) {
      console.error('Error initializing Firebase:', error);
      throw error;
    }
  }
  return db;
}

export interface AnalysisData {
  timestamp: any;
  designChallenge?: string;
  decisions: string[];
  analysis: {
    full: string[];
    simplified: string[];
  };
  tone?: string;
  consensusPoints?: string[];
  hasThinkingDialogue?: boolean;
  thinkingAnalysis?: {
    full: string[];
    simplified: string[];
  };
}

export interface UserActivityData {
  action: string;
  timestamp?: any;
  boardId?: string;
  userId?: string;
  additionalData?: any;
}

export interface DesignProposalData {
  proposals: string[];
  timestamp?: any;
  boardId?: string;
}

export interface ThinkingDialogueData {
  dialogues: string[];
  timestamp?: any;
  boardId?: string;
  modelType?: string;
}

export interface ConsensusPointData {
  points: string[];
  timestamp?: any;
  boardId?: string;
}

export interface ThemeData {
  themes: Array<{
    name: string;
    color: string;
    description?: string;
  }>;
  timestamp?: any;
  boardId?: string;
}

// Cache for infrequently changing data
const dataCache: {
  designProposals?: DesignProposalData;
  thinkingDialogues?: ThinkingDialogueData;
  consensusPoints?: ConsensusPointData;
  themes?: ThemeData;
  lastUpdated: {
    [key: string]: number;
  };
} = { lastUpdated: {} };

// Cache expiry time in milliseconds (5 minutes)
const CACHE_EXPIRY = 5 * 60 * 1000;

/**
 * Checks if cached data is still valid
 */
function isCacheValid(cacheKey: string): boolean {
  const lastUpdated = dataCache.lastUpdated[cacheKey];
  if (!lastUpdated) return false;
  return Date.now() - lastUpdated < CACHE_EXPIRY;
}

/**
 * Updates cache with new data
 */
function updateCache(cacheKey: string, data: any): void {
  dataCache[cacheKey as keyof typeof dataCache] = data;
  dataCache.lastUpdated[cacheKey] = Date.now();
}

// Helper function to aggressively merge points
function aggressiveMergePoints(points: string[]): string[] {
  // First round of merging with standard similarity
  let mergedPoints = mergeSimilarPoints(points);
  
  console.log('All synthesized points before cutting:', {
    total: points.length,
    points: points
  });
  console.log('Points after initial merging:', {
    total: mergedPoints.length,
    points: mergedPoints
  });
  
  // If we still have too many points, do another round with more aggressive merging
  if (mergedPoints.length > 10) {
    // Group points by their main topic/theme
    const topics = new Map<string, string[]>();
    
    mergedPoints.forEach(point => {
      // Extract key words (nouns, verbs) from the point
      const keyWords = point.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3) // Only consider significant words
        .slice(0, 3) // Take first 3 significant words as topic
        .join(' ');
      
      if (!topics.has(keyWords)) {
        topics.set(keyWords, []);
      }
      topics.get(keyWords)!.push(point);
    });
    
    // For each topic group, keep only the most concise point
    mergedPoints = Array.from(topics.values())
      .map(group => group.sort((a, b) => a.length - b.length)[0])
      .sort((a, b) => a.length - b.length)
      .slice(0, 10); // Ensure we have at most 10 points

    console.log('Points after aggressive merging:', {
      total: mergedPoints.length,
      points: mergedPoints
    });
  }
  
  return mergedPoints;
}

export async function saveAnalysis(data: AnalysisData, sessionId?: string) {
  try {
    const database = getFirebaseDB();
    const path = sessionId ? `sessions/${sessionId}/analyses` : 'analyses';
    const analysisRef = ref(database, path);
    
    // Save with timestamp
    await push(analysisRef, {
      ...data,
      timestamp: serverTimestamp(),
    });
    console.log('Analysis saved to Firebase with consensus points:', data.consensusPoints?.length || 0);
  } catch (error) {
    console.error('Error saving analysis:', error);
    throw error;
  }
}

export async function getSynthesizedPoints() {
  try {
    const database = getFirebaseDB();
    const analysisRef = ref(database, 'analyses');
    const snapshot = await get(analysisRef);
    
    if (!snapshot.exists()) {
      return [];
    }

    // Collect all points (both full and simplified)
    const allPoints = new Set<string>();
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val() as AnalysisData;
      if (data.analysis?.simplified) {
        data.analysis.simplified.forEach(point => allPoints.add(point));
      }
      // Also consider full points for completeness
      if (data.analysis?.full) {
        data.analysis.full.forEach(point => allPoints.add(point));
      }
    });

    // Aggressively merge points to get a concise set
    const mergedPoints = aggressiveMergePoints(Array.from(allPoints));

    // Format points for better readability
    return mergedPoints.map(point => {
      // Clean up the point
      return point
        .replace(/^\d+\.\s*/, '') // Remove leading numbers
        .replace(/^[-•]\s*/, '') // Remove bullet points
        .trim()
        .charAt(0).toUpperCase() + point.slice(1); // Capitalize first letter
    });
  } catch (error) {
    console.error('Error fetching synthesized points:', error);
    return [];
  }
}

/**
 * Logs user activity to Firebase Realtime Database
 * @param data User activity data to log
 */
export async function logUserActivity(data: UserActivityData, sessionId?: string) {
  try {
    const database = getFirebaseDB();
    const path = sessionId ? `sessions/${sessionId}/userActivity` : 'userActivity';
    const activityRef = ref(database, path);
    
    // Save with timestamp if not provided
    await push(activityRef, {
      ...data,
      timestamp: data.timestamp || serverTimestamp(),
    });
    console.log(`User activity logged: ${data.action}`);
  } catch (error) {
    console.error('Error logging user activity:', error);
    // Silently fail to not disrupt user experience
  }
}

/**
 * Saves design proposals to Firebase
 * @param data Design proposal data to save
 */
export async function saveDesignProposals(data: DesignProposalData, sessionId?: string): Promise<void> {
  try {
    const database = getFirebaseDB();
    const path = sessionId ? `sessions/${sessionId}/designProposals` : 'designProposals';
    const proposalsRef = ref(database, path);
    
    // Save with timestamp
    await push(proposalsRef, {
      ...data,
      timestamp: data.timestamp || serverTimestamp(),
    });
    
    // Update cache
    updateCache('designProposals', data);
    console.log(`Saved ${data.proposals.length} design proposals to Firebase`);
  } catch (error) {
    console.error('Error saving design proposals:', error);
    throw error;
  }
}

/**
 * Gets the latest design proposals
 * @param useCachedData Whether to use cached data if available
 */
export async function getLatestDesignProposals(useCachedData: boolean = true): Promise<DesignProposalData | null> {
  // Check cache first if requested
  if (useCachedData && dataCache.designProposals && isCacheValid('designProposals')) {
    return dataCache.designProposals;
  }
  
  try {
    const database = getFirebaseDB();
    const proposalsRef = ref(database, 'designProposals');
    const snapshot = await get(proposalsRef);
    
    if (!snapshot.exists()) {
      return null;
    }
    
    // Find the most recent entry
    let latestProposals: DesignProposalData | null = null;
    let latestTimestamp = 0;
    
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val() as DesignProposalData;
      const timestamp = data.timestamp ? new Date(data.timestamp).getTime() : 0;
      
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latestProposals = data;
      }
    });
    
    // Update cache if we found data
    if (latestProposals) {
      updateCache('designProposals', latestProposals);
    }
    
    return latestProposals;
  } catch (error) {
    console.error('Error getting design proposals:', error);
    return null;
  }
}

/**
 * Saves thinking dialogues to Firebase
 * @param data Thinking dialogue data to save
 */
export async function saveThinkingDialogues(data: ThinkingDialogueData, sessionId?: string): Promise<void> {
  try {
    const database = getFirebaseDB();
    const path = sessionId ? `sessions/${sessionId}/thinkingDialogues` : 'thinkingDialogues';
    const dialoguesRef = ref(database, path);
    
    // Save with timestamp
    await push(dialoguesRef, {
      ...data,
      timestamp: data.timestamp || serverTimestamp(),
    });
    
    // Update cache
    updateCache('thinkingDialogues', data);
    console.log(`Saved ${data.dialogues.length} thinking dialogues to Firebase`);
  } catch (error) {
    console.error('Error saving thinking dialogues:', error);
    throw error;
  }
}

/**
 * Gets the latest thinking dialogues
 * @param useCachedData Whether to use cached data if available
 */
export async function getLatestThinkingDialogues(useCachedData: boolean = true): Promise<ThinkingDialogueData | null> {
  // Check cache first if requested
  if (useCachedData && dataCache.thinkingDialogues && isCacheValid('thinkingDialogues')) {
    return dataCache.thinkingDialogues;
  }
  
  try {
    const database = getFirebaseDB();
    const dialoguesRef = ref(database, 'thinkingDialogues');
    const snapshot = await get(dialoguesRef);
    
    if (!snapshot.exists()) {
      return null;
    }
    
    // Find the most recent entry
    let latestDialogues: ThinkingDialogueData | null = null;
    let latestTimestamp = 0;
    
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val() as ThinkingDialogueData;
      const timestamp = data.timestamp ? new Date(data.timestamp).getTime() : 0;
      
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latestDialogues = data;
      }
    });
    
    // Update cache if we found data
    if (latestDialogues) {
      updateCache('thinkingDialogues', latestDialogues);
    }
    
    return latestDialogues;
  } catch (error) {
    console.error('Error getting thinking dialogues:', error);
    return null;
  }
}

/**
 * Saves consensus points to Firebase
 * @param data Consensus point data to save
 */
export async function saveConsensusPoints(data: ConsensusPointData, sessionId?: string): Promise<void> {
  try {
    const database = getFirebaseDB();
    const path = sessionId ? `sessions/${sessionId}/consensusPoints` : 'consensusPoints';
    const consensusRef = ref(database, path);
    
    // Save with timestamp
    await push(consensusRef, {
      ...data,
      timestamp: data.timestamp || serverTimestamp(),
    });
    
    // Update cache
    updateCache('consensusPoints', data);
    console.log(`Saved ${data.points.length} consensus points to Firebase`);
  } catch (error) {
    console.error('Error saving consensus points:', error);
    throw error;
  }
}

/**
 * Gets the latest consensus points
 * @param useCachedData Whether to use cached data if available
 */
export async function getLatestConsensusPoints(useCachedData: boolean = true): Promise<ConsensusPointData | null> {
  // Check cache first if requested
  if (useCachedData && dataCache.consensusPoints && isCacheValid('consensusPoints')) {
    return dataCache.consensusPoints;
  }
  
  try {
    const database = getFirebaseDB();
    const consensusRef = ref(database, 'consensusPoints');
    const snapshot = await get(consensusRef);
    
    if (!snapshot.exists()) {
      return null;
    }
    
    // Find the most recent entry
    let latestConsensus: ConsensusPointData | null = null;
    let latestTimestamp = 0;
    
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val() as ConsensusPointData;
      const timestamp = data.timestamp ? new Date(data.timestamp).getTime() : 0;
      
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latestConsensus = data;
      }
    });
    
    // Update cache if we found data
    if (latestConsensus) {
      updateCache('consensusPoints', latestConsensus);
    }
    
    return latestConsensus;
  } catch (error) {
    console.error('Error getting consensus points:', error);
    return null;
  }
}

/**
 * Saves design themes to Firebase
 * @param data Theme data to save
 */
export async function saveDesignThemes(data: ThemeData, sessionId?: string): Promise<void> {
  try {
    const database = getFirebaseDB();
    const path = sessionId ? `sessions/${sessionId}/designThemes` : 'designThemes';
    const themesRef = ref(database, path);
    
    // Save with timestamp
    await push(themesRef, {
      ...data,
      timestamp: data.timestamp || serverTimestamp(),
    });
    
    // Update cache
    updateCache('themes', data);
    console.log(`Saved ${data.themes.length} design themes to Firebase`);
  } catch (error) {
    console.error('Error saving design themes:', error);
    throw error;
  }
}

/**
 * Gets the latest design themes
 * @param useCachedData Whether to use cached data if available
 */
export async function getLatestDesignThemes(useCachedData: boolean = true): Promise<ThemeData | null> {
  // Check cache first if requested
  if (useCachedData && dataCache.themes && isCacheValid('themes')) {
    return dataCache.themes;
  }
  
  try {
    const database = getFirebaseDB();
    const themesRef = ref(database, 'designThemes');
    const snapshot = await get(themesRef);
    
    if (!snapshot.exists()) {
      return null;
    }
    
    // Find the most recent entry
    let latestThemes: ThemeData | null = null;
    let latestTimestamp = 0;
    
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val() as ThemeData;
      const timestamp = data.timestamp ? new Date(data.timestamp).getTime() : 0;
      
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latestThemes = data;
      }
    });
    
    // Update cache if we found data
    if (latestThemes) {
      updateCache('themes', latestThemes);
    }
    
    return latestThemes;
  } catch (error) {
    console.error('Error getting design themes:', error);
    return null;
  }
}

/**
 * Uploads HTML content to Firebase Storage and returns a public URL
 * 
 * @param html - The HTML content to upload
 * @param fileName - Optional file name (defaults to a timestamped name)
 * @returns Promise<string> - A promise that resolves to the public URL
 */
export async function uploadHtmlToFirebase(
  html: string, 
  fileName?: string
): Promise<string> {
  try {
    // Ensure Firebase is initialized by calling getFirebaseDB
    // This will initialize the app if it hasn't been already
    getFirebaseDB();
    
    // Get the storage instance
    const storage = getStorage();
    
    if (!storage) {
      throw new Error('Firebase Storage not initialized properly.');
    }
    
    // Create a unique filename if not provided
    const timestamp = new Date().getTime();
    const uniqueFileName = fileName || `document_${timestamp}.html`;
    
    // Create a storage reference
    const htmlRef = storageRef(storage, `documents/${uniqueFileName}`);
    
    // Upload the HTML content as a string with HTML metadata
    await uploadString(htmlRef, html, 'raw', {
      contentType: 'text/html',
    });
    
    // Get the public URL
    const publicUrl = await getDownloadURL(htmlRef);
    console.log('Firebase Storage upload successful. Public URL:', publicUrl);
    
    return publicUrl;
  } catch (error) {
    console.error('Error uploading HTML to Firebase:', error);
    throw error;
  }
}

export { ref, push, serverTimestamp, get, query, orderByChild, equalTo, limitToLast, set }; 
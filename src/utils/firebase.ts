'use client';

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, push, serverTimestamp, get, Database } from 'firebase/database';
import { firebaseConfig } from './config';
import { mergeSimilarPoints } from './textProcessing';

// Initialize Firebase only on the client side
let app: FirebaseApp | undefined;
let db: Database | null = null;

// Initialize Firebase lazily only when needed
function getFirebaseDB() {
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

export async function saveAnalysis(data: AnalysisData) {
  try {
    const database = getFirebaseDB();
    const analysisRef = ref(database, 'analyses');
    await push(analysisRef, {
      ...data,
      timestamp: serverTimestamp(),
    });
    console.log('Analysis saved to Firebase');
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
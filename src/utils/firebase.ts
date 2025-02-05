'use client';

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, serverTimestamp } from 'firebase/database';
import { firebaseConfig } from '../app/page';

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (error) {
  // If already initialized, use the existing app
  app = initializeApp(firebaseConfig, 'codesignbot');
}

const db = getDatabase(app);

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

export async function saveAnalysis(data: AnalysisData) {
  try {
    const analysisRef = ref(db, 'analyses');
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
/**
 * Migration utilities for cleaning up and maintaining database
 */
'use client';

import { getDatabase, ref, set, get, push } from 'firebase/database';
import { getFirebaseDB } from './firebase';

/**
 * Removes all embeddings from Firebase Realtime Database
 * This should be run once to clean up the database
 */
export async function clearFirebaseEmbeddings(): Promise<{success: boolean, count: number}> {
  try {
    console.log('Starting Firebase embeddings cleanup...');
    const database = getFirebaseDB();
    const embeddingsRef = ref(database, 'embeddings');
    
    // Get count of embeddings before deletion
    const snapshot = await get(embeddingsRef);
    let count = 0;
    if (snapshot.exists()) {
      const embeddingsData = snapshot.val();
      count = Object.keys(embeddingsData).length;
      console.log(`Found ${count} embedding records to delete`);
    } else {
      console.log('No embeddings found in the database');
    }
    
    // Set the embeddings reference to null to delete all data
    await set(embeddingsRef, null);
    
    console.log(`Successfully cleared ${count} Firebase embeddings data records`);
    return { success: true, count };
  } catch (error) {
    console.error('Error clearing Firebase embeddings:', error);
    return { success: false, count: 0 };
  }
}

/**
 * Migrates existing analysis data to the new structure
 * This is a one-time migration to ensure all data is properly structured
 */
export async function migrateAnalysisData(): Promise<{
  success: boolean;
  stats: {
    analyses: number;
    consensusPoints: number;
  };
}> {
  try {
    console.log('Starting analysis data migration...');
    const database = getFirebaseDB();
    
    // Get all existing analyses
    const analysesRef = ref(database, 'analyses');
    const analysesSnapshot = await get(analysesRef);
    
    let analysesCount = 0;
    let consensusCount = 0;
    
    // Process each analysis to extract consensus points
    if (analysesSnapshot.exists()) {
      const analysesData = analysesSnapshot.val();
      analysesCount = Object.keys(analysesData).length;
      
      // Extract consensus points from analyses
      const consensusPointsSet = new Set<string>();
      
      // Process each analysis
      Object.values(analysesData).forEach((analysis: any) => {
        if (analysis.consensusPoints && Array.isArray(analysis.consensusPoints)) {
          analysis.consensusPoints.forEach((point: string) => consensusPointsSet.add(point));
        }
      });
      
      // If we have consensus points, save them
      if (consensusPointsSet.size > 0) {
        consensusCount = consensusPointsSet.size;
        
        // Save to consensus points collection
        const consensusRef = ref(database, 'consensusPoints');
        
        try {
          // Get board ID if possible
          let boardId = 'migrated-data';
          try {
            const boardInfo = await miro.board.getInfo();
            boardId = boardInfo.id;
          } catch (e) {
            console.log('Unable to get board ID for migration, using default');
          }
          
          await push(consensusRef, {
            points: Array.from(consensusPointsSet),
            timestamp: new Date().getTime(),
            boardId,
            migrated: true
          });
          
          console.log(`Migrated ${consensusCount} consensus points to new collection`);
        } catch (error) {
          console.error('Error saving consensus points during migration:', error);
        }
      }
    }
    
    console.log('Analysis data migration completed successfully');
    return {
      success: true,
      stats: {
        analyses: analysesCount,
        consensusPoints: consensusCount
      }
    };
  } catch (error) {
    console.error('Error during analysis data migration:', error);
    return {
      success: false,
      stats: {
        analyses: 0,
        consensusPoints: 0
      }
    };
  }
}

/**
 * Gets information about Firebase Realtime Database structure
 * Useful for diagnostics
 */
export async function getDatabaseStructureInfo(): Promise<any> {
  try {
    const database = getFirebaseDB();
    const rootRef = ref(database);
    
    // Get the structure by querying top-level paths
    const paths = ['analyses', 'userActivity', 'embeddings'];
    const structure: any = {};
    
    for (const path of paths) {
      const pathRef = ref(database, path);
      const snapshot = await fetch(pathRef.toString() + '.json').then(resp => resp.json());
      
      if (snapshot) {
        // Calculate rough size and count
        const count = typeof snapshot === 'object' ? Object.keys(snapshot).length : 0;
        const size = JSON.stringify(snapshot).length;
        
        structure[path] = {
          exists: true,
          count,
          approximateSizeBytes: size
        };
      } else {
        structure[path] = {
          exists: false
        };
      }
    }
    
    return structure;
  } catch (error) {
    console.error('Error getting database structure:', error);
    return { error: 'Failed to get database structure information' };
  }
} 
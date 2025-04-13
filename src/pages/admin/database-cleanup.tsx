'use client';

import React, { useState } from 'react';
import { clearFirebaseEmbeddings, getDatabaseStructureInfo, migrateAnalysisData } from '../../utils/migrations';

/**
 * Admin page for database cleanup and maintenance
 */
export default function DatabaseCleanup() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [structureInfo, setStructureInfo] = useState<any>(null);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  
  // Run embeddings cleanup
  const handleCleanupEmbeddings = async () => {
    if (confirm('Are you sure you want to clear all embeddings from Firebase Realtime Database?')) {
      setIsLoading(true);
      try {
        const success = await clearFirebaseEmbeddings();
        setResult({ success, message: success ? 'Successfully cleared embeddings' : 'Failed to clear embeddings' });
      } catch (error) {
        setResult({ success: false, message: 'Error clearing embeddings', error });
      } finally {
        setIsLoading(false);
      }
    }
  };
  
  // Get database structure information
  const handleGetStructureInfo = async () => {
    setIsLoading(true);
    try {
      const info = await getDatabaseStructureInfo();
      setStructureInfo(info);
    } catch (error) {
      setStructureInfo({ error: 'Failed to get structure info' });
    } finally {
      setIsLoading(false);
    }
  };

  // Run data migration
  const handleMigrateData = async () => {
    if (confirm('Are you sure you want to migrate existing analysis data to the new structure?')) {
      setIsLoading(true);
      try {
        const result = await migrateAnalysisData();
        setMigrationResult(result);
      } catch (error) {
        setMigrationResult({ 
          success: false, 
          message: 'Error during migration', 
          error
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Database Cleanup and Maintenance</h1>
      <p>Use this page to run database cleanup tasks and view database structure information.</p>
      
      <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Database Structure Information</h2>
        <button 
          onClick={handleGetStructureInfo}
          disabled={isLoading}
          style={{ 
            padding: '8px 16px',
            background: '#f0f0f0', 
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isLoading ? 'Loading...' : 'Get Structure Info'}
        </button>
        
        {structureInfo && (
          <div style={{ marginTop: '16px' }}>
            <h3>Structure Information:</h3>
            <pre style={{ 
              background: '#f5f5f5', 
              padding: '12px', 
              borderRadius: '4px',
              overflow: 'auto'
            }}>
              {JSON.stringify(structureInfo, null, 2)}
            </pre>
          </div>
        )}
      </div>
      
      <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Clear Embeddings Cache</h2>
        <p>This will remove all embeddings stored in the Firebase Realtime Database.</p>
        <button 
          onClick={handleCleanupEmbeddings}
          disabled={isLoading}
          style={{ 
            padding: '8px 16px',
            background: '#ff6b6b', 
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isLoading ? 'Running...' : 'Clear Embeddings Cache'}
        </button>
        
        {result && (
          <div style={{ 
            marginTop: '16px', 
            padding: '12px', 
            borderRadius: '4px',
            background: result.success ? '#d4edda' : '#f8d7da',
            color: result.success ? '#155724' : '#721c24',
          }}>
            <p><strong>{result.message}</strong></p>
            {result.error && <pre>{JSON.stringify(result.error, null, 2)}</pre>}
          </div>
        )}
      </div>
      
      <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Migrate Analysis Data</h2>
        <p>This will migrate any existing analysis data to the new data structure format.</p>
        <button 
          onClick={handleMigrateData}
          disabled={isLoading}
          style={{ 
            padding: '8px 16px',
            background: '#4c72af', 
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isLoading ? 'Running...' : 'Migrate Analysis Data'}
        </button>
        
        {migrationResult && (
          <div style={{ 
            marginTop: '16px', 
            padding: '12px', 
            borderRadius: '4px',
            background: migrationResult.success ? '#d4edda' : '#f8d7da',
            color: migrationResult.success ? '#155724' : '#721c24',
          }}>
            <p><strong>{migrationResult.success ? 'Migration successful' : 'Migration failed'}</strong></p>
            {migrationResult.stats && (
              <div>
                <p>Processed {migrationResult.stats.analyses} analyses</p>
                <p>Migrated {migrationResult.stats.consensusPoints} consensus points</p>
              </div>
            )}
            {migrationResult.error && <pre>{JSON.stringify(migrationResult.error, null, 2)}</pre>}
          </div>
        )}
      </div>
    </div>
  );
} 
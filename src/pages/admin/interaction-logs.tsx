'use client';

import React, { useState, useEffect } from 'react';
import { getDatabase, ref, get, query, orderByChild, limitToLast } from 'firebase/database';
import { getFirebaseDB } from '../../utils/firebase';

/**
 * Admin page for viewing interaction logs and other stored data in Firebase
 */
export default function InteractionLogs() {
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [designProposals, setDesignProposals] = useState<any[]>([]);
  const [thinkingDialogues, setThinkingDialogues] = useState<any[]>([]);
  const [consensusPoints, setConsensusPoints] = useState<any[]>([]);
  const [designThemes, setDesignThemes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>('activity');
  const [error, setError] = useState<string | null>(null);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const database = getFirebaseDB();
        
        // Fetch activity logs
        const activityRef = ref(database, 'userActivity');
        const activityQuery = query(activityRef, orderByChild('timestamp'), limitToLast(100));
        const activitySnapshot = await get(activityQuery);
        
        // Fetch analyses
        const analysesRef = ref(database, 'analyses');
        const analysesQuery = query(analysesRef, orderByChild('timestamp'), limitToLast(20));
        const analysesSnapshot = await get(analysesQuery);
        
        // Fetch design proposals
        const proposalsRef = ref(database, 'designProposals');
        const proposalsQuery = query(proposalsRef, orderByChild('timestamp'), limitToLast(20));
        const proposalsSnapshot = await get(proposalsQuery);
        
        // Fetch thinking dialogues
        const dialoguesRef = ref(database, 'thinkingDialogues');
        const dialoguesQuery = query(dialoguesRef, orderByChild('timestamp'), limitToLast(20));
        const dialoguesSnapshot = await get(dialoguesQuery);
        
        // Fetch consensus points
        const consensusRef = ref(database, 'consensusPoints');
        const consensusQuery = query(consensusRef, orderByChild('timestamp'), limitToLast(20));
        const consensusSnapshot = await get(consensusQuery);
        
        // Fetch design themes
        const themesRef = ref(database, 'designThemes');
        const themesQuery = query(themesRef, orderByChild('timestamp'), limitToLast(20));
        const themesSnapshot = await get(themesQuery);
        
        // Process the data
        const activityItems: any[] = [];
        const analysesItems: any[] = [];
        const proposalsItems: any[] = [];
        const dialoguesItems: any[] = [];
        const consensusItems: any[] = [];
        const themesItems: any[] = [];
        
        activitySnapshot.forEach((childSnapshot) => {
          const data = childSnapshot.val();
          data.id = childSnapshot.key;
          activityItems.push(data);
        });
        
        analysesSnapshot.forEach((childSnapshot) => {
          const data = childSnapshot.val();
          data.id = childSnapshot.key;
          analysesItems.push(data);
        });
        
        proposalsSnapshot.forEach((childSnapshot) => {
          const data = childSnapshot.val();
          data.id = childSnapshot.key;
          proposalsItems.push(data);
        });
        
        dialoguesSnapshot.forEach((childSnapshot) => {
          const data = childSnapshot.val();
          data.id = childSnapshot.key;
          dialoguesItems.push(data);
        });
        
        consensusSnapshot.forEach((childSnapshot) => {
          const data = childSnapshot.val();
          data.id = childSnapshot.key;
          consensusItems.push(data);
        });
        
        themesSnapshot.forEach((childSnapshot) => {
          const data = childSnapshot.val();
          data.id = childSnapshot.key;
          themesItems.push(data);
        });
        
        // Sort by timestamp, newest first
        setActivityLogs(activityItems.sort((a, b) => b.timestamp - a.timestamp));
        setAnalyses(analysesItems.sort((a, b) => b.timestamp - a.timestamp));
        setDesignProposals(proposalsItems.sort((a, b) => b.timestamp - a.timestamp));
        setThinkingDialogues(dialoguesItems.sort((a, b) => b.timestamp - a.timestamp));
        setConsensusPoints(consensusItems.sort((a, b) => b.timestamp - a.timestamp));
        setDesignThemes(themesItems.sort((a, b) => b.timestamp - a.timestamp));
        
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to fetch data from Firebase. Please check the console for details.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Format date for display
  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    
    const date = new Date(timestamp);
    return date.toLocaleString();
  };
  
  // Render activity logs
  const renderActivityLogs = () => {
    if (activityLogs.length === 0) {
      return <p>No activity logs found.</p>;
    }
    
    return (
      <div className="logs-container">
        {activityLogs.map((log) => (
          <div key={log.id} className="log-item">
            <div className="log-header">
              <span className="log-action">{log.action}</span>
              <span className="log-timestamp">{formatDate(log.timestamp)}</span>
            </div>
            {log.boardId && <div className="log-board">Board: {log.boardId}</div>}
            {log.userId && <div className="log-user">User: {log.userId}</div>}
            {log.additionalData && (
              <div className="log-details">
                <h4>Details:</h4>
                <pre>{JSON.stringify(log.additionalData, null, 2)}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  
  // Render analyses
  const renderAnalyses = () => {
    if (analyses.length === 0) {
      return <p>No analyses found.</p>;
    }
    
    return (
      <div className="logs-container">
        {analyses.map((analysis) => (
          <div key={analysis.id} className="log-item">
            <div className="log-header">
              <span className="log-action">Analysis</span>
              <span className="log-timestamp">{formatDate(analysis.timestamp)}</span>
            </div>
            <div className="log-details">
              <h4>Design Challenge:</h4>
              <p>{analysis.designChallenge || 'Not specified'}</p>
              
              <h4>Tone:</h4>
              <p>{analysis.tone || 'Normal'}</p>
              
              <div className="collapsible">
                <h4>Full Analysis:</h4>
                <div className="collapsible-content">
                  {analysis.analysis?.full?.map((point: string, index: number) => (
                    <p key={index}>{point}</p>
                  ))}
                </div>
              </div>
              
              {analysis.analysis?.simplified?.length > 0 && (
                <div className="collapsible">
                  <h4>Simplified Analysis:</h4>
                  <div className="collapsible-content">
                    {analysis.analysis.simplified.map((point: string, index: number) => (
                      <p key={index}>{point}</p>
                    ))}
                  </div>
                </div>
              )}
              
              {analysis.consensusPoints?.length > 0 && (
                <div className="collapsible">
                  <h4>Consensus Points:</h4>
                  <div className="collapsible-content">
                    {analysis.consensusPoints.map((point: string, index: number) => (
                      <p key={index}>{point}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  // Render design proposals
  const renderDesignProposals = () => {
    if (designProposals.length === 0) {
      return <p>No design proposals found.</p>;
    }
    
    return (
      <div className="logs-container">
        {designProposals.map((data) => (
          <div key={data.id} className="log-item">
            <div className="log-header">
              <span className="log-action">Design Proposals</span>
              <span className="log-timestamp">{formatDate(data.timestamp)}</span>
            </div>
            {data.boardId && <div className="log-board">Board: {data.boardId}</div>}
            <div className="log-details">
              <h4>Proposals ({data.proposals.length}):</h4>
              <ul>
                {data.proposals.map((proposal: string, index: number) => (
                  <li key={index}>{proposal}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  // Render thinking dialogues
  const renderThinkingDialogues = () => {
    if (thinkingDialogues.length === 0) {
      return <p>No thinking dialogues found.</p>;
    }
    
    return (
      <div className="logs-container">
        {thinkingDialogues.map((data) => (
          <div key={data.id} className="log-item">
            <div className="log-header">
              <span className="log-action">Thinking Dialogues</span>
              <span className="log-timestamp">{formatDate(data.timestamp)}</span>
            </div>
            {data.boardId && <div className="log-board">Board: {data.boardId}</div>}
            {data.modelType && <div className="log-model">Model: {data.modelType}</div>}
            <div className="log-details">
              <h4>Dialogues ({data.dialogues.length}):</h4>
              <div className="collapsible">
                <div className="collapsible-content">
                  {data.dialogues.map((dialogue: string, index: number) => (
                    <div key={index} className="thinking-item">
                      <p>{dialogue}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  // Render consensus points
  const renderConsensusPoints = () => {
    if (consensusPoints.length === 0) {
      return <p>No consensus points found.</p>;
    }
    
    return (
      <div className="logs-container">
        {consensusPoints.map((data) => (
          <div key={data.id} className="log-item">
            <div className="log-header">
              <span className="log-action">Consensus Points</span>
              <span className="log-timestamp">{formatDate(data.timestamp)}</span>
            </div>
            {data.boardId && <div className="log-board">Board: {data.boardId}</div>}
            <div className="log-details">
              <h4>Points ({data.points.length}):</h4>
              <ul>
                {data.points.map((point: string, index: number) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  // Render design themes
  const renderDesignThemes = () => {
    if (designThemes.length === 0) {
      return <p>No design themes found.</p>;
    }
    
    return (
      <div className="logs-container">
        {designThemes.map((data) => (
          <div key={data.id} className="log-item">
            <div className="log-header">
              <span className="log-action">Design Themes</span>
              <span className="log-timestamp">{formatDate(data.timestamp)}</span>
            </div>
            {data.boardId && <div className="log-board">Board: {data.boardId}</div>}
            <div className="log-details">
              <h4>Themes ({data.themes.length}):</h4>
              <div className="theme-container">
                {data.themes.map((theme: any, index: number) => (
                  <div 
                    key={index} 
                    className="theme-item"
                    style={{
                      borderLeft: `4px solid #${theme.color}`,
                      padding: '8px',
                      margin: '8px 0',
                      backgroundColor: `#${theme.color}20`
                    }}
                  >
                    <h5>{theme.name}</h5>
                    {theme.description && <p>{theme.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>Interaction Data Logs</h1>
      <p>View user interactions and stored data from the Firebase Realtime Database.</p>
      
      {/* Tabs navigation */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
          style={{ 
            padding: '8px 16px',
            background: activeTab === 'activity' ? '#f0f0f0' : 'transparent',
            border: '1px solid #ccc',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            margin: '0 4px'
          }}
        >
          Activity Logs
        </button>
        <button 
          className={`tab ${activeTab === 'analyses' ? 'active' : ''}`}
          onClick={() => setActiveTab('analyses')}
          style={{ 
            padding: '8px 16px',
            background: activeTab === 'analyses' ? '#f0f0f0' : 'transparent',
            border: '1px solid #ccc',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            margin: '0 4px'
          }}
        >
          Analyses
        </button>
        <button 
          className={`tab ${activeTab === 'proposals' ? 'active' : ''}`}
          onClick={() => setActiveTab('proposals')}
          style={{ 
            padding: '8px 16px',
            background: activeTab === 'proposals' ? '#f0f0f0' : 'transparent',
            border: '1px solid #ccc',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            margin: '0 4px'
          }}
        >
          Design Proposals
        </button>
        <button 
          className={`tab ${activeTab === 'thinking' ? 'active' : ''}`}
          onClick={() => setActiveTab('thinking')}
          style={{ 
            padding: '8px 16px',
            background: activeTab === 'thinking' ? '#f0f0f0' : 'transparent',
            border: '1px solid #ccc',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            margin: '0 4px'
          }}
        >
          Thinking Dialogues
        </button>
        <button 
          className={`tab ${activeTab === 'consensus' ? 'active' : ''}`}
          onClick={() => setActiveTab('consensus')}
          style={{ 
            padding: '8px 16px',
            background: activeTab === 'consensus' ? '#f0f0f0' : 'transparent',
            border: '1px solid #ccc',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            margin: '0 4px'
          }}
        >
          Consensus Points
        </button>
        <button 
          className={`tab ${activeTab === 'themes' ? 'active' : ''}`}
          onClick={() => setActiveTab('themes')}
          style={{ 
            padding: '8px 16px',
            background: activeTab === 'themes' ? '#f0f0f0' : 'transparent',
            border: '1px solid #ccc',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            margin: '0 4px'
          }}
        >
          Design Themes
        </button>
      </div>
      
      {/* Tab content */}
      <div 
        className="tab-content"
        style={{ 
          border: '1px solid #ccc',
          padding: '20px',
          borderRadius: '0 4px 4px 4px',
          minHeight: '300px'
        }}
      >
        {error && (
          <div style={{ 
            background: '#f8d7da', 
            color: '#721c24', 
            padding: '12px', 
            borderRadius: '4px',
            marginBottom: '16px'
          }}>
            {error}
          </div>
        )}
        
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            Loading data...
          </div>
        ) : (
          <>
            {activeTab === 'activity' && renderActivityLogs()}
            {activeTab === 'analyses' && renderAnalyses()}
            {activeTab === 'proposals' && renderDesignProposals()}
            {activeTab === 'thinking' && renderThinkingDialogues()}
            {activeTab === 'consensus' && renderConsensusPoints()}
            {activeTab === 'themes' && renderDesignThemes()}
          </>
        )}
      </div>
      
      <style jsx>{`
        .logs-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .log-item {
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          padding: 12px;
          background-color: #f9f9f9;
        }
        
        .log-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid #eee;
        }
        
        .log-action {
          font-weight: bold;
          color: #333;
        }
        
        .log-timestamp {
          color: #666;
          font-size: 0.9em;
        }
        
        .log-board, .log-user, .log-model {
          color: #555;
          font-size: 0.9em;
          margin-bottom: 8px;
        }
        
        .log-details {
          margin-top: 12px;
        }
        
        .log-details h4 {
          margin: 8px 0 4px 0;
          color: #444;
        }
        
        .log-details ul {
          margin: 4px 0;
          padding-left: 20px;
        }
        
        .log-details li {
          margin-bottom: 4px;
        }
        
        .collapsible-content {
          max-height: 300px;
          overflow-y: auto;
          padding: 8px;
          background-color: #fff;
          border: 1px solid #eee;
          border-radius: 4px;
        }
        
        .theme-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .thinking-item {
          padding: 8px;
          background-color: #f5f5f5;
          border-radius: 4px;
          margin-bottom: 8px;
        }
      `}</style>
    </div>
  );
} 
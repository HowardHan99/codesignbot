'use client';
import React, { useState, useCallback } from 'react';
import { MainBoard } from './DesignDecisions';
import Link from 'next/link';

interface SerializedBoard {
  id: string;
  name: string;
}

interface BoardDisplayProps {
  boards: SerializedBoard[];
}

export function BoardDisplay({ boards }: BoardDisplayProps) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [gptResponses, setGptResponses] = useState<string[]>([]);

  const handleAnalysisClick = useCallback(() => {
    if (isAnalyzing) return;
    
    if (showAnalysis) {
      // Instead of just hiding, refresh the analysis
      setIsAnalyzing(true);
      // Clear previous responses
      setGptResponses([]);
    } else {
      setShowAnalysis(true);
      setIsAnalyzing(true);
    }
  }, [isAnalyzing, showAnalysis]);

  const onAnalysisComplete = useCallback(() => {
    setIsAnalyzing(false);
  }, []);

  const handleResponsesUpdate = useCallback((responses: string[]) => {
    setGptResponses(responses);
  }, []);

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        padding: '10px', 
        marginBottom: '20px',
        borderBottom: '1px solid #eee'
      }}>
        <Link href="/knowledge">
          <div style={{
            padding: '8px 16px',
            backgroundColor: '#4262ff',
            color: 'white',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'inline-block'
          }}>
            Knowledge Base Manager
          </div>
        </Link>
      </div>
      
      <MainBoard 
        showAnalysis={showAnalysis}
        isAnalyzing={isAnalyzing}
        onAnalysisClick={handleAnalysisClick}
        onAnalysisComplete={onAnalysisComplete}
        onResponsesUpdate={handleResponsesUpdate}
      />
    </div>
  );
} 
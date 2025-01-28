'use client';
import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { SendtoBoard } from './SendtoBoard';

const AntagoInteract = dynamic(() => import('./AntagoInteract'), { 
  ssr: false 
});

interface SerializedBoard {
  id: string;
  name: string;
}

interface BoardDisplayProps {
  boards: SerializedBoard[];
  stickyNotes: string[];
}

export function BoardDisplay({ boards, stickyNotes }: BoardDisplayProps) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [gptResponses, setGptResponses] = useState<string[]>([]);

  const handleAnalysisClick = useCallback(() => {
    if (isAnalyzing) return;
    
    if (showAnalysis) {
      setShowAnalysis(false);
      setGptResponses([]); // Clear responses when hiding
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
    <>
      <p>This is a list of all the boards that your user has access to:</p>
      <ul>
        {boards?.map((board) => (
          <li key={board.id}>{board.name}</li>
        ))}
      </ul>
      <p>This is a list of all the sticky notes that your user has access to:</p>
      <ul>
        {stickyNotes?.map((stickyNote) => (
          <li key={stickyNote}>{stickyNote}</li>
        ))}
      </ul>
      <button 
        className="button button-primary"
        onClick={handleAnalysisClick}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? 'Analysis in Progress...' : 
         showAnalysis ? 'Hide Analysis' : 'Analyze Sticky Notes'}
      </button>
      {showAnalysis && stickyNotes && 
        <AntagoInteract 
          stickyNotes={stickyNotes} 
          onComplete={onAnalysisComplete}
          onResponsesUpdate={handleResponsesUpdate}
        />
      }
      <SendtoBoard responses={gptResponses} />
    </>
  );
} 
'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { SendtoBoard } from './SendtoBoard';
import ResponseStore from '../utils/responseStore';

interface StickyNote {
  id: string;
  content: string;
}

interface AntagoInteractProps {
  stickyNotes: string[];
  onComplete?: () => void;
  onResponsesUpdate?: (responses: string[]) => void;
}

const AntagoInteract: React.FC<AntagoInteractProps> = ({ 
  stickyNotes, 
  onComplete,
  onResponsesUpdate 
}) => {
  const [responses, setResponses] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const responseStore = ResponseStore.getInstance();

  const generateResponse = async (note: string, previousResponse?: string) => {
    const response = await fetch('/api/openaiwrap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userPrompt: note,
        systemPrompt: `The user is making some design decisions, please provide an antagonistic response that shows the user the problems with their decision that are also constructive and helpful. You can use response such as the decision while beneficial to some group of people, might bring problems to other group of people that the users didn't consider. Format your response as a list of points, with each main point separated by ** **. Do not use ** ** within a point itself. Example format: 'Point 1 explanation here ** ** Point 2 explanation here ** ** Point 3 explanation here'. Limit to 3 points.${
          previousResponse ? `\n\nPrevious response for reference: ${previousResponse}` : ''
        }`
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    return data.response.replace(/•/g, '**').replace(/\n/g, ' ** ');
  };

  // Split response into separate points
  const splitResponse = (response: string): string[] => {
    return response.split('**').map(point => point.trim()).filter(point => point.length > 0);
  };

  const processNotes = useCallback(async () => {
    if (!stickyNotes.length) {
      return;
    }

    setLoading(true);
    const newResponses = [];
    const splitResponses = [];
    
    try {
      console.log('Processing notes for analysis');
      
      for (let i = 0; i < stickyNotes.length; i++) {
        const noteContent = stickyNotes[i];
        const noteId = `note-${i}`;
        
        // Generate new response considering previous response
        const storedResponse = responseStore.getStoredResponse(noteId);
        const response = await generateResponse(noteContent, storedResponse?.response);
        responseStore.storeResponse(noteId, noteContent, response);

        newResponses.push(response);
        splitResponses.push(...splitResponse(response));
      }
      
      setResponses(newResponses);
      onResponsesUpdate?.(splitResponses);
      onComplete?.();
      
    } catch (error) {
      console.error('Error processing sticky notes:', error);
      setError('Failed to process sticky notes. Please try again.');
      onComplete?.();
    } finally {
      setLoading(false);
    }
  }, [stickyNotes, generateResponse, onComplete, onResponsesUpdate]);

  // Process notes when component mounts
  useEffect(() => {
    if (stickyNotes.length > 0) {
      processNotes();
    }
  }, []); // Only run once on mount

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="antago-responses">
      {loading ? (
        <div>Processing sticky notes...</div>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <h2>Antagonistic Points</h2>
            {responses.map((response, index) => (
              <div key={index} className="response-pair" style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}>
                <p><strong>Original Note:</strong> {stickyNotes[index]}</p>
                <p><strong>Response Points:</strong></p>
                <ul>
                  {splitResponse(response).map((point, pointIndex) => (
                    <li key={pointIndex} style={{ marginLeft: '20px', marginBottom: '5px' }}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {responses.length > 0 && (
              <SendtoBoard responses={responses.flatMap(response => splitResponse(response))} />
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AntagoInteract;

'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SendtoBoard } from './SendtoBoard';
import ResponseStore from '../utils/responseStore';

interface AntagoInteractProps {
  stickyNotes: string[];
  onComplete?: () => void;
  onResponsesUpdate?: (responses: string[]) => void;
  shouldRefresh?: boolean;
}

const AntagoInteract: React.FC<AntagoInteractProps> = ({ 
  stickyNotes, 
  onComplete,
  onResponsesUpdate,
  shouldRefresh = false
}) => {
  const [responses, setResponses] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const responseStore = ResponseStore.getInstance();
  const processedRef = useRef(false);
  const [designChallenge, setDesignChallenge] = useState<string>('');

  // Function to get design challenge from the frame
  const getDesignChallenge = useCallback(async () => {
    try {
      // Get all frames
      const frames = await miro.board.get({ type: 'frame' });
      const challengeFrame = frames.find(f => f.title === 'Design-Challenge');
      
      if (!challengeFrame) {
        console.log('Design-Challenge frame not found');
        return '';
      }

      // Get sticky notes in the challenge frame
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      const challengeStickies = allStickies.filter(sticky => sticky.parentId === challengeFrame.id);
      
      if (challengeStickies.length === 0) {
        console.log('No sticky notes found in Design-Challenge frame');
        return '';
      }

      // Use the content of the first sticky note as the challenge
      const challenge = challengeStickies.map(sticky => sticky.content).join('\n');
      console.log('Found design challenge:', challenge);
      return challenge;

    } catch (err) {
      console.error('Error getting design challenge:', err);
      return '';
    }
  }, []);

  // Fetch design challenge when component mounts
  useEffect(() => {
    getDesignChallenge().then(challenge => setDesignChallenge(challenge));
  }, [getDesignChallenge]);

  const generateResponse = async (note: string, previousResponse?: string) => {
    const response = await fetch('/api/openaiwrap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userPrompt: note,
        systemPrompt: `The user has made several design decisions to tackle the design challenge: "${designChallenge || 'No challenge specified'}". Please analyze these decisions as a whole and provide antagonistic responses that show potential problems or conflicts between these decisions. Consider how these decisions might affect different stakeholders or create unexpected consequences when implemented together. Format your response as a list of points separated by ** **. Do not use numbers, bullet points, or ** ** within the points themselves that would create a split. Each point should be a complete, self-contained criticism. Example format: 'First criticism here ** ** Second criticism here ** ** Third criticism here'. DIRECTLY START WITH THE CRITICISM. No NEED FOR TITLE, SUMMARY, OR ANYTHING ELSE. Limit the 3 points.
        }`,
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
    // First split by ** **
    const points = response.split('**').map(point => point.trim()).filter(point => point.length > 0);
    
    // Clean up any remaining numbers at the start of points
    return points.map(point => {
      // Remove numbered prefixes like "1.", "2.", etc.
      return point.replace(/^\d+\.\s*/, '').trim();
    }).filter(point => point.length > 0);
  };

  const processNotes = useCallback(async (forceProcess: boolean = false) => {
    if (!stickyNotes.length || (processedRef.current && !forceProcess)) {
      return;
    }

    setLoading(true);
    
    try {
      console.log('Processing combined notes for analysis');
      responseStore.clear(); // Clear stored responses on each analysis
      
      // Combine all sticky notes into one message
      const combinedMessage = stickyNotes.map((note, index) => 
        `Design Decision ${index + 1}: ${note}`
      ).join('\n');
      
      console.log('Combined message:', combinedMessage);
      
      // Generate a single response for all decisions
      const response = await generateResponse(combinedMessage);
      const splitResponses = splitResponse(response);
      
      setResponses([response]); // Store as single response
      onResponsesUpdate?.(splitResponses);
      processedRef.current = true;
      onComplete?.();
      
    } catch (error) {
      console.error('Error processing sticky notes:', error);
      setError('Failed to process sticky notes. Please try again.');
      onComplete?.();
    } finally {
      setLoading(false);
    }
  }, [stickyNotes, generateResponse, onComplete, onResponsesUpdate]);

  // Process notes on mount or refresh
  useEffect(() => {
    if (stickyNotes.length > 0) {
      if (shouldRefresh) {
        // If it's a refresh, force processing
        processedRef.current = false;
        processNotes(true);
      } else if (!processedRef.current) {
        // If it's initial mount and not processed yet
        processNotes(false);
      }
    }
  }, [shouldRefresh, stickyNotes, processNotes]); // Include all dependencies

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
            <h2>Antagonistic Analysis</h2>
            {responses.length > 0 && (
              <div className="response-pair" style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}>
                <div style={{ marginBottom: '15px' }}>
                  <strong>Design Decisions:</strong>
                  <ul style={{ marginTop: '10px' }}>
                    {stickyNotes.map((note, index) => (
                      <li key={index} style={{ marginBottom: '5px' }}>
                        Decision {index + 1}: {note}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>Analysis Points:</strong>
                  <ul>
                    {splitResponse(responses[0]).map((point, pointIndex) => (
                      <li key={pointIndex} style={{ marginLeft: '20px', marginBottom: '5px' }}>{point}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {responses.length > 0 && (
              <SendtoBoard responses={splitResponse(responses[0])} />
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AntagoInteract;

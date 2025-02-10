'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SendtoBoard } from './SendtoBoard';
import ResponseStore from '../utils/responseStore';
import { saveAnalysis } from '../utils/firebase';

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
  const [isSimplifiedMode, setIsSimplifiedMode] = useState(false);
  const [simplifiedResponses, setSimplifiedResponses] = useState<string[]>([]);
  const [selectedTone, setSelectedTone] = useState<string>('');
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
        systemPrompt: `The user has made several design decisions to tackle the design challenge: "${designChallenge || 'No challenge specified'}". Please analyze these decisions as a whole and provide antagonistic responses that show potential problems or conflicts between these decisions. Consider how these decisions might affect different stakeholders or create unexpected consequences when implemented together. Format your response as a list of points separated by ** **. Do not use numbers, bullet points, or ** ** within the points themselves that would create a split. Each point should be a complete, self-contained criticism. Example format: 'First criticism here ** ** Second criticism here ** ** Third criticism here'. DIRECTLY START WITH THE CRITICISM. No NEED FOR TITLE, SUMMARY, OR ANYTHING ELSE. Limit to 3 points.`,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    console.log('Generated response:', data.response);
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

  const simplifyResponse = async (response: string) => {
    try {
      const simplifyResult = await fetch('/api/openaiwrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPrompt: response,
          systemPrompt: `Please simplify the following criticism points into three very concise, clear points. Each point should be no more than 20 words. Format the response with points separated by ** **. Do not include any other text, numbers, or formatting.`
        }),
      });

      if (!simplifyResult.ok) {
        throw new Error(`HTTP error! status: ${simplifyResult.status}`);
      }

      const data = await simplifyResult.json();
      return data.response.replace(/•/g, '**').replace(/\n/g, ' ** ');
    } catch (error) {
      console.error('Error simplifying response:', error);
      return response;
    }
  };

  const adjustToneOnly = async (response: string, newTone: string) => {
    try {
      const adjustResult = await fetch('/api/openaiwrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPrompt: response,
          systemPrompt: `Rewrite the following three criticism points using a ${newTone} tone. Keep the same core messages but adjust the language and delivery to match the ${newTone} tone. Ensure there are exactly three points. Format with ** ** between points. Do not add any additional text, numbers, or formatting.`
        }),
      });

      if (!adjustResult.ok) {
        throw new Error(`HTTP error! status: ${adjustResult.status}`);
      }

      const data = await adjustResult.json();
      return data.response.replace(/•/g, '**').replace(/\n/g, ' ** ');
    } catch (error) {
      console.error('Error adjusting tone:', error);
      return response;
    }
  };

  const processNotes = useCallback(async (forceProcess: boolean = false) => {
    if (!stickyNotes.length || (processedRef.current && !forceProcess)) {
      return;
    }

    setLoading(true);
    
    try {
      console.log('Processing combined notes for analysis');
      responseStore.clear();
      
      const combinedMessage = stickyNotes.map((note, index) => 
        `Design Decision ${index + 1}: ${note}`
      ).join('\n');
      
      console.log('Combined message:', combinedMessage);
      
      // Generate initial response
      const response = await generateResponse(combinedMessage);
      setResponses([response]);

      // Generate simplified version from the response
      const simplified = await simplifyResponse(response);
      setSimplifiedResponses([simplified]);
      
      // Save to Firebase
      try {
        await saveAnalysis({
          timestamp: null, // Will be set by serverTimestamp()
          designChallenge: designChallenge,
          decisions: stickyNotes,
          analysis: {
            full: splitResponse(response),
            simplified: splitResponse(simplified)
          },
          tone: selectedTone || 'normal'
        });
      } catch (error) {
        console.error('Error saving to Firebase:', error);
      }
      
      // Pass the appropriate response based on current mode
      const splitResponses = splitResponse(isSimplifiedMode ? simplified : response);
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
  }, [stickyNotes, generateResponse, onComplete, onResponsesUpdate, isSimplifiedMode, selectedTone, designChallenge]);

  // Handle mode toggle
  const handleModeToggle = useCallback(() => {
    const newMode = !isSimplifiedMode;
    setIsSimplifiedMode(newMode);
    
    // Update parent with appropriate responses when mode changes
    if (responses.length > 0) {
      // If switching to simplified mode, use simplified responses
      // If switching back to full mode, use the stored full responses
      const currentResponses = newMode ? simplifiedResponses : responses;
      onResponsesUpdate?.(splitResponse(currentResponses[0]));
    }
  }, [responses, simplifiedResponses, isSimplifiedMode, onResponsesUpdate]);

  // Handle tone change
  const handleToneChange = useCallback(async (newTone: string) => {
    setSelectedTone(newTone);
    if (!responses.length) return;

    try {
      const currentResponse = isSimplifiedMode ? simplifiedResponses[0] : responses[0];
      if (!newTone) {
        // If switching to normal tone, use the original responses
        const storedFull = responseStore.getStoredResponse('full-response');
        const storedSimplified = responseStore.getStoredResponse('simplified-response');
        if (storedFull?.response) setResponses([storedFull.response]);
        if (storedSimplified?.response) setSimplifiedResponses([storedSimplified.response]);
        onResponsesUpdate?.(splitResponse(isSimplifiedMode ? storedSimplified?.response || '' : storedFull?.response || ''));
        return;
      }

      const adjustedResponse = await adjustToneOnly(currentResponse, newTone);
      if (isSimplifiedMode) {
        setSimplifiedResponses([adjustedResponse]);
      } else {
        setResponses([adjustedResponse]);
      }

      // Save tone change to Firebase
      try {
        await saveAnalysis({
          timestamp: null,
          designChallenge: designChallenge,
          decisions: stickyNotes,
          analysis: {
            full: splitResponse(isSimplifiedMode ? responses[0] : adjustedResponse),
            simplified: splitResponse(isSimplifiedMode ? adjustedResponse : simplifiedResponses[0])
          },
          tone: newTone
        });
      } catch (error) {
        console.error('Error saving tone change to Firebase:', error);
      }

      onResponsesUpdate?.(splitResponse(adjustedResponse));
    } catch (error) {
      console.error('Error updating tone:', error);
    }
  }, [responses, simplifiedResponses, isSimplifiedMode, onResponsesUpdate, stickyNotes, designChallenge]);

  // Process notes only on explicit refresh or initial mount
  useEffect(() => {
    const shouldProcess = stickyNotes.length > 0 && (!processedRef.current || shouldRefresh);
    if (shouldProcess) {
      processedRef.current = false;
      processNotes();
    }
  }, [shouldRefresh, stickyNotes]);

  // Store both full and simplified responses in local storage for persistence
  useEffect(() => {
    if (responses.length > 0) {
      responseStore.storeResponse('full-response', 'full', responses[0]);
    }
  }, [responses]);

  useEffect(() => {
    if (simplifiedResponses.length > 0) {
      responseStore.storeResponse('simplified-response', 'simplified', simplifiedResponses[0]);
    }
  }, [simplifiedResponses]);

  // Restore responses from storage on mount
  useEffect(() => {
    const storedFull = responseStore.getStoredResponse('full-response');
    const storedSimplified = responseStore.getStoredResponse('simplified-response');
    
    if (storedFull?.response) {
      setResponses([storedFull.response]);
    }
    if (storedSimplified?.response) {
      setSimplifiedResponses([storedSimplified.response]);
    }
  }, []);

  const cleanAnalysis = async () => {
    try {
      // Get all frames
      const frames = await miro.board.get({ type: 'frame' });
      const responseFrame = frames.find(f => f.title === 'Antagonistic-Response');
      
      if (!responseFrame) {
        console.log('No Antagonistic-Response frame found');
        return;
      }

      // Get all sticky notes in the frame
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      const frameStickies = allStickies.filter(sticky => sticky.parentId === responseFrame.id);
      
      // Delete all sticky notes in the frame
      for (const sticky of frameStickies) {
        await miro.board.remove(sticky);
      }
      
      console.log(`Removed ${frameStickies.length} sticky notes from Antagonistic-Response frame`);
    } catch (error) {
      console.error('Error cleaning analysis:', error);
    }
  };

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
            <h2 style={{ margin: '0 0 16px 0' }}>Antagonistic Analysis</h2>
            <div style={{ 
              display: 'flex',
              gap: '24px',
              alignItems: 'center',
              marginBottom: '20px',
              padding: '12px',
              backgroundColor: '#f5f5f7',
              borderRadius: '8px'
            }}>
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: '100px'
              }}>
                <label style={{ fontSize: '14px', fontWeight: '500', whiteSpace: 'nowrap' }}>Tone:</label>
                <select 
                  value={selectedTone}
                  onChange={(e) => handleToneChange(e.target.value)}
                  className="select"
                  style={{ flex: 1 }}
                >
                  <option value="">Normal</option>
                  <option value="persuasive">Persuasive</option>
                  <option value="aggressive">Aggressive</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <label style={{ fontSize: '14px', fontWeight: '500', whiteSpace: 'nowrap' }}>Message:</label>
                <label className="toggle" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                  <input 
                    type="checkbox" 
                    tabIndex={0}
                    checked={isSimplifiedMode}
                    onChange={handleModeToggle}
                  />
                  <span style={{ marginLeft: '0px', fontSize: '14px', whiteSpace: 'nowrap' }}>
                    {isSimplifiedMode ? 'Simple' : 'Full'}
                  </span>
                </label>
              </div>
            </div>
            {(isSimplifiedMode ? simplifiedResponses : responses).length > 0 && (
              <div className="response-pair" style={{ 
                marginBottom: '20px', 
                padding: '16px', 
                border: '1px solid #e6e6e6', 
                borderRadius: '8px',
                backgroundColor: '#ffffff'
              }}>
                <div>
                  <strong style={{ display: 'block', marginBottom: '12px' }}>
                    Analysis Points {isSimplifiedMode ? '(Simplified)' : ''} {selectedTone ? `(${selectedTone} tone)` : ''}
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {splitResponse((isSimplifiedMode ? simplifiedResponses : responses)[0]).map((point, pointIndex) => (
                      <li key={pointIndex} style={{ marginBottom: '8px' }}>{point}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'left' }}>
            {(isSimplifiedMode ? simplifiedResponses : responses).length > 0 && (
              <>
                <SendtoBoard responses={splitResponse((isSimplifiedMode ? simplifiedResponses : responses)[0])} />
                <button
                  type="button"
                  onClick={cleanAnalysis}
                  className="button button-secondary"
                >
                  Clean Analysis Board
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AntagoInteract;

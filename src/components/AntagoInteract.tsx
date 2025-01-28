'use client';
import React, { useEffect, useState } from 'react';

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
  const [loading, setLoading] = useState(true);  // Start with loading true
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const processNotes = async () => {
      if (!stickyNotes.length) {
        if (isMounted) {
          setLoading(false);
        }
        return;
      }

      const newResponses = [];
      
      try {
        console.log('Starting to process notes:', stickyNotes);
        
        for (const note of stickyNotes) {
          if (!isMounted) return;

          const response = await fetch('/api/openaiwrap', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userPrompt: note,
              systemPrompt: "The user is making some design decision, please provide a antagnoistic response that shows the user the problems with their decision that are also constructive and helpful. Show your response in a way that is easy to understand and follow. You can use markdown or bullet points."
            }),
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const data = await response.json();
          console.log('Received response:', data);
          
          if (data.error) {
            throw new Error(data.error);
          }
          newResponses.push(data.response);
        }
        
        if (isMounted) {
          console.log('All notes processed, setting responses:', newResponses);
          setResponses(newResponses);
          onResponsesUpdate?.(newResponses);
          onComplete?.();
          setLoading(false);
        }
        
      } catch (error) {
        console.error('Error processing sticky notes:', error);
        if (isMounted) {
          setError('Failed to process sticky notes. Please try again.');
          onComplete?.();
          setLoading(false);
        }
      }
    };

    processNotes();

    return () => {
      isMounted = false;
    };
  }, [stickyNotes]); // Only depend on stickyNotes

  console.log('Rendering with state:', { loading, error, responses });

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="antago-responses">
      {loading ? (
        <div>Processing sticky notes...</div>
      ) : (
        <>
          <h2>AI Responses to Sticky Notes</h2>
          {responses.map((response, index) => (
            <div key={index} className="response-pair">
              <p><strong>Sticky Note:</strong> {stickyNotes[index]}</p>
              <p><strong>Response:</strong> {response}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default AntagoInteract;

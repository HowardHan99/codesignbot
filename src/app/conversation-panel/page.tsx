'use client';

import React, { useEffect, useState } from 'react';
import { ConversationPanel } from '../../components/ConversationPanel';

export default function ConversationPanelPage() {
  const [designChallenge, setDesignChallenge] = useState<string>('');
  const [currentCriticism, setCurrentCriticism] = useState<string[]>([]);

  useEffect(() => {
    // Listen for messages from the parent window
    const handleMessage = (e: MessageEvent) => {
      if (e.data.type === 'INIT_PANEL') {
        setDesignChallenge(e.data.designChallenge || '');
        setCurrentCriticism(e.data.currentCriticism || []);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleInstruction = (instruction: string) => {
    // Send instruction back to parent window
    window.parent.postMessage({ type: 'INSTRUCTION', instruction }, '*');
  };

  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      <ConversationPanel
        designChallenge={designChallenge}
        currentCriticism={currentCriticism}
        onInstructionReceived={handleInstruction}
      />
    </div>
  );
} 
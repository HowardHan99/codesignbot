'use client';

import React, { useEffect, useState } from 'react';
import { MiroConversationModal } from '../../components/MiroConversationModal';

export default function ConversationModalPage() {
  const [designChallenge, setDesignChallenge] = useState('');
  const [currentCriticism, setCurrentCriticism] = useState<string[]>([]);

  useEffect(() => {
    // Get data from the parent window
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'INIT_MODAL') {
        setDesignChallenge(event.data.designChallenge);
        setCurrentCriticism(event.data.currentCriticism);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleClose = () => {
    // Notify parent to close modal
    window.parent.postMessage({ type: 'CLOSE_MODAL' }, '*');
  };

  const handleInstruction = (instruction: string) => {
    // Send instruction to parent
    window.parent.postMessage({ type: 'INSTRUCTION', instruction }, '*');
  };

  return (
    <div style={{
      background: 'transparent',
      minHeight: '100vh',
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      <MiroConversationModal
        designChallenge={designChallenge}
        currentCriticism={currentCriticism}
        onClose={handleClose}
        onInstructionReceived={handleInstruction}
      />
      <style jsx global>{`
        body {
          background: transparent !important;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
        #__next {
          background: transparent !important;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
} 
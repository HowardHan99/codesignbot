'use client';

import React, { useEffect, useState } from 'react';
import { MiroConversationModal } from '../../components/MiroConversationModal';

export default function ConversationModalPage() {
  const [designChallenge, setDesignChallenge] = useState('');
  const [currentCriticism, setCurrentCriticism] = useState<string[]>([]);

  useEffect(() => {
    // Get data from the broadcast channel
    const channel = new BroadcastChannel('miro-conversation');
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'INIT_MODAL') {
        setDesignChallenge(event.data.designChallenge);
        setCurrentCriticism(event.data.currentCriticism);
      }
    };

    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

  const handleClose = () => {
    // Send close message to parent
    window.parent.postMessage({ type: 'CLOSE_MODAL' }, '*');
  };

  return (
    <div style={{
      background: 'transparent',
      minHeight: '100vh',
      width: '100vw',
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      <MiroConversationModal
        designChallenge={designChallenge}
        currentCriticism={currentCriticism}
        onClose={handleClose}
      />
      <style jsx global>{`
        body {
          background: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden;
          width: 100vw;
        }
        #__next {
          background: transparent !important;
          width: 100%;
        }
        #root {
          padding: 0 !important;
          margin: 0 !important;
          width: 100%;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
} 
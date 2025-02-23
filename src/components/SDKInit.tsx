'use client';

import { useEffect } from 'react';
import { MiroDesignService } from '../services/miro/designService';

export const MiroSDKInit = () => {
  useEffect(() => {
    const initializeApp = async () => {
      // Initialize panel opening
      miro.board.ui.on('icon:click', async () => {
        await miro.board.ui.openPanel({url: '/'});
      });

      // Analyze design decisions
      const analysis = await MiroDesignService.analyzeDesignDecisions();
      console.log('Design Decision Analysis:', analysis);

      // Subscribe to connector changes
      miro.board.ui.on('connector:created', async () => {
        console.log('Connector created, updating analysis...');
        const updatedAnalysis = await MiroDesignService.analyzeDesignDecisions();
        console.log('Updated Design Decision Analysis:', updatedAnalysis);
      });

      miro.board.ui.on('connector:deleted', async () => {
        console.log('Connector deleted, updating analysis...');
        const updatedAnalysis = await MiroDesignService.analyzeDesignDecisions();
        console.log('Updated Design Decision Analysis:', updatedAnalysis);
      });
    };

    initializeApp().catch(console.error);
  }, []);

  return null;
};

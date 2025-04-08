'use client';

import React from 'react';
import { KnowledgeManager } from '../../components/KnowledgeManager';

export default function KnowledgePage() {
  return (
    <div style={{ 
      maxWidth: '1200px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    }}>
      <KnowledgeManager />
    </div>
  );
} 
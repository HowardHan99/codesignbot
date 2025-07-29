export const firebaseConfig = {
  apiKey: "AIzaSyBsHoAvguKeV8XnT6EkV2Q0hyAv6OEw8bo",
  authDomain: "codesignagent-f4420.firebaseapp.com",
  databaseURL: "https://codesignagent-f4420-default-rtdb.firebaseio.com",
  projectId: "codesignagent-f4420",
  storageBucket: "codesignagent-f4420.firebasestorage.app",
  messagingSenderId: "121164910498",
  appId: "1:121164910498:web:552f246dc0a3f28792ecfb",
  measurementId: "G-YKVCSPS593"
};

// Frame configuration
export const frameConfig = {
  names: {
    designChallenge: 'Design-Challenge',
    sketchReference: 'Sketch-Reference',
    designProposal: 'Design-Proposal',
    antagonisticResponse: 'Agent-Response',
    consensus: 'Consensus',
    discardedPoints: 'Discarded-Points',
    incorporateSuggestions: 'Incorporate-Suggestions',
    thinkingDialogue: 'Thinking-Dialogue',
    ragContent: 'Enhanced-Context',
    agentPrompt: "Current-Agent-Prompt",
    variedResponses: 'Varied-Response',
    realTimeResponse: 'Real-time-response',
  },
  defaults: {
    width: 1200,
    height: 1600,
    initialX: 1000,
    initialY: 0
  }
};

// Sticky note configuration
export const stickyConfig = {
  dimensions: {
    width: 300,
    height: 200,
    spacing: 50
  },
  layout: {
    itemsPerColumn: 7,
    topMargin: 100,
    leftMargin: 100
  },
  // Sticky note shapes for specific frames, default is square, override for specific frames, change the width and height of the sticky note
  shapes: {
    // Default shape for sticky notes
    default: 'square',
    // Override for specific frames
    frameOverrides: {
      'Design-Proposal': {
        shape: 'rectangle',
        width: 500,
        height: 250
      },
      'Agent-Response': {
        shape: 'rectangle',
        width: 500,
        height: 250,
        color: 'light_pink'
      }
    }
  },
  colors: {
    decision: {
      highRelevance: 'light_yellow',
      mediumRelevance: 'light_green',
      lowRelevance: 'light_pink'
    },
    response: {
      highRelevance: 'light_blue',
      mediumRelevance: 'light_green',
      lowRelevance: 'light_pink'
    },
    critique: {
      accessibility: 'light_pink',
      inclusivity: 'violet',
      sustainability: 'light_green'
    },
    critiqueRegular: 'light_yellow',
    critiqueDetail: 'light_green'
  }
};

// Relevance scoring configuration
export const relevanceConfig = {
  scale: {
    min: 1,
    max: 3,
    defaultThreshold: 2
  },
  delayBetweenCreations: 200, // ms
};

// Inclusive design critique configuration
export const inclusiveDesignConfig = {
  evaluationInterval: 30000, // 30 seconds between evaluations
  principles: [
    'Consider diverse user needs and abilities',
    'Avoid over-investment in privileged user groups',
    'Consider broader community impact',
    'Avoid assumptions about user capabilities',
    'Prioritize user well-being over business goals'
  ]
};

// AI provider configuration
export const aiConfig = {
  provider: 'openai' as 'openai' | 'gemini', // Default to OpenAI
  models: {
    openai: 'gpt-4.1', // Default to GPT-4.1
    gemini: 'gemini-2.5-pro'
  },
  // Some utility functions always use OpenAI regardless of main provider setting
  alwaysUseOpenAiFor: [
    'unpackPointDetail',
    'synthesizeRagInsights',
    'analyzeImages'
  ]
}; 
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
    antagonisticResponse: 'Antagonistic-Response',
    consensus: 'Consensus',
    incorporateSuggestions: 'Incorporate-Suggestions',
    thinkingDialogue: 'Thinking-Dialogue',
    analysisResponse: 'Analysis-Response',
    ragContent: 'Enhanced-Context',
    realTimeResponse: 'Real-time-response'
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
      'Antagonistic-Response': {
        shape: 'rectangle',
        width: 500,
        height: 250
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
    }
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
    'Address power imbalances',
    'Use inclusive language',
    'Avoid assumptions about user capabilities',
    'Prioritize user well-being over business goals'
  ]
}; 
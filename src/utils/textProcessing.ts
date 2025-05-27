'use client';

import { SequenceMatcher } from 'difflib';

interface ProcessedPoint {
  original: string;
  simplified: string;
  stems: string[];
  key: string; // Add a normalized key for better matching
}

// Enhanced tokenizer that preserves meaningful punctuation and structure
function tokenize(text: string): string[] {
  return text.toLowerCase()
    // Replace multiple spaces and newlines with single space
    .replace(/\s+/g, ' ')
    // Remove all punctuation except apostrophes in contractions
    .replace(/['']s\b/g, '') // Remove possessives
    .replace(/[^\w\s']/g, ' ') // More aggressive punctuation removal
    .trim()
    .split(/\s+/)
    .filter(token => token.length > 0);
}

// Enhanced stemming with more comprehensive rules
function stem(word: string): string {
  let result = word.toLowerCase();
  
  // Handle special cases first
  if (result.length <= 3) return result;
  
  // Common irregular forms and synonyms
  const irregulars: { [key: string]: string } = {
    'are': 'be', 'were': 'be', 'is': 'be', 'am': 'be',
    'has': 'have', 'have': 'have', 'had': 'have',
    'does': 'do', 'did': 'do',
    'would': 'will', 'should': 'shall',
    'could': 'can', 'might': 'may',
    'better': 'good', 'best': 'good',
    'worse': 'bad', 'worst': 'bad',
    'larger': 'large', 'largest': 'large',
    'smaller': 'small', 'smallest': 'small',
    'more': 'many', 'most': 'many',
    'less': 'few', 'least': 'few'
  };
  
  if (irregulars[result]) return irregulars[result];
  
  // Order matters - apply rules from most specific to most general
  const rules = [
    { suffix: 'ational', replacement: 'ate' },
    { suffix: 'tional', replacement: 'tion' },
    { suffix: 'ization', replacement: 'ize' },
    { suffix: 'fulness', replacement: 'ful' },
    { suffix: 'ousness', replacement: 'ous' },
    { suffix: 'alities', replacement: 'al' },
    { suffix: 'iveness', replacement: 'ive' },
    { suffix: 'ements', replacement: 'e' },
    { suffix: 'ments', replacement: '' },
    { suffix: 'ities', replacement: 'ity' },
    { suffix: 'ingly', replacement: '' },
    { suffix: 'fully', replacement: 'ful' },
    { suffix: 'ation', replacement: 'ate' },
    { suffix: 'ness', replacement: '' },
    { suffix: 'ings', replacement: '' },
    { suffix: 'able', replacement: '' },
    { suffix: 'ible', replacement: '' },
    { suffix: 'edly', replacement: 'e' },
    { suffix: 'ally', replacement: 'al' },
    { suffix: 'ing', replacement: '' },
    { suffix: 'ion', replacement: '' },
    { suffix: 'ies', replacement: 'y' },
    { suffix: 'ive', replacement: '' },
    { suffix: 'ize', replacement: '' },
    { suffix: 'ed', replacement: '' },
    { suffix: 'es', replacement: '' },
    { suffix: 'ly', replacement: '' },
    { suffix: 's', replacement: '' }
  ];

  for (const rule of rules) {
    if (result.endsWith(rule.suffix)) {
      const stem = result.slice(0, -rule.suffix.length) + rule.replacement;
      if (stem.length > 2) {
        result = stem;
        break;
      }
    }
  }
  
  return result;
}

// Get a normalized key for comparison
function getNormalizedKey(text: string): string {
  return tokenize(text)
    .map(stem)
    .sort() // Sort tokens for consistent ordering
    .join(' ');
}

export function getSimilarity(text1: string, text2: string): number {
  // Get similarity based on character sequence
  const seqSimilarity = new SequenceMatcher(null, text1.toLowerCase(), text2.toLowerCase()).ratio();
  
  // Get similarity based on word overlap
  const words1 = new Set(tokenize(text1));
  const words2 = new Set(tokenize(text2));
  const commonWords = new Set([...words1].filter(x => words2.has(x)));
  const wordSimilarity = (2.0 * commonWords.size) / (words1.size + words2.size);
  
  // Get similarity based on stems
  const stems1 = new Set([...words1].map(stem));
  const stems2 = new Set([...words2].map(stem));
  const commonStems = new Set([...stems1].filter(x => stems2.has(x)));
  const stemSimilarity = (2.0 * commonStems.size) / (stems1.size + stems2.size);
  
  // Return weighted average favoring stem and word similarity
  return (stemSimilarity * 0.4) + (wordSimilarity * 0.4) + (seqSimilarity * 0.2);
}

export function processSuggestion(text: string): ProcessedPoint {
  const tokens = tokenize(text);
  const stems = tokens.map(stem);
  
  // More aggressive text simplification
  const simplified = text
    // Remove more stop words
    .replace(/\b(the|a|an|in|on|at|to|for|of|with|by|this|that|these|those|such|as|and|or|but|if|when|where|how|what|which|who|whom|whose|why|whether|while|though|although|however|therefore|thus|hence|so|because|since|unless|until|despite|though|although)\b/gi, '')
    // Remove parenthetical expressions
    .replace(/\([^)]*\)/g, '')
    // Remove common phrases that don't add meaning
    .replace(/\b(in terms of|in order to|in addition to|in relation to|with respect to|due to the fact that|in the event that|in the case of)\b/gi, '')
    // Normalize spaces and clean up
    .replace(/\s+/g, ' ')
    .replace(/["""'']/g, '')
    .trim();

  return {
    original: text,
    simplified,
    stems,
    key: getNormalizedKey(simplified)
  };
}

export const splitResponse = (response: string): string[] => {
  if (!response) return [];
  
  // Split by ## headings (for new format) or ** markers (for legacy format)
  let points: string[] = [];
  
  // Check if response contains ## headings (new format)
  if (response.includes('##')) {
    // Split by --- separators first, then process each section
    const sections = response.split(/---+/).map(section => section.trim()).filter(section => section.length > 0);
    
    for (const section of sections) {
      // Further split each section by ## headings if it contains multiple
      const subsections = section.split(/(?=##)/);
      for (const subsection of subsections) {
        const trimmed = subsection.trim();
        if (trimmed.length > 0 && trimmed.startsWith('##')) {
          // Split title from content
          const lines = trimmed.split('\n');
          const titleLine = lines[0].trim(); // The ## heading
          const contentLines = lines.slice(1).join('\n').trim(); // Everything after the heading
          
          // Add the title as a separate sticky note
          if (titleLine) {
            points.push(titleLine);
          }
          
          // Add the content as a separate sticky note if it exists
          if (contentLines && contentLines.length > 0) {
            points.push(contentLines);
          }
        }
      }
    }
  } else {
    // Legacy format: split by ** **
    points = response.split('**').map(point => point.trim()).filter(point => point.length > 0);
  }
  
  // Clean up any remaining numbers at the start of points
  return points.map(point => {
    // Remove numbered prefixes like "1.", "2.", etc.
    return point.replace(/^\d+\.\s*/, '').trim();
  }).filter(point => point.length > 0);
};

export const mergeSimilarPoints = (points: string[]): string[] => {
  if (!points.length) return [];

  // Group similar points together
  const groups: string[][] = [];
  const usedPoints = new Set<string>();

  for (const point of points) {
    if (usedPoints.has(point)) continue;
    
    const similarPoints = [point];
    usedPoints.add(point);

    // Find similar points
    for (const otherPoint of points) {
      if (!usedPoints.has(otherPoint) && calculateSimilarity(point, otherPoint) > 0.7) {
        similarPoints.push(otherPoint);
        usedPoints.add(otherPoint);
      }
    }

    groups.push(similarPoints);
  }

  // Select the most representative point from each group
  return groups.map(group => {
    // Choose the shortest point as it's likely the most concise
    return group.reduce((shortest, current) => 
      current.length < shortest.length ? current : shortest
    );
  });
};

function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
} 
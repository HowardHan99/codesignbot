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

export function mergeSimilarPoints(points: string[]): string[] {
  if (!points.length) return [];

  // Process all points
  const processedPoints = points.map(processSuggestion);
  const mergedPoints = new Map<string, ProcessedPoint>();

  // First pass: group by normalized key
  processedPoints.forEach(point => {
    const existing = mergedPoints.get(point.key);
    if (existing) {
      // Keep the shorter version
      if (point.original.length < existing.original.length) {
        mergedPoints.set(point.key, point);
      }
    } else {
      mergedPoints.set(point.key, point);
    }
  });

  // Second pass: check for similar points using enhanced similarity
  const finalPoints = new Map<string, ProcessedPoint>();
  Array.from(mergedPoints.values()).forEach(point => {
    let foundMatch = false;
    let bestMatchKey = '';
    let bestMatchSimilarity = 0;
    
    for (const [key, existingPoint] of finalPoints.entries()) {
      const similarity = getSimilarity(point.simplified, existingPoint.simplified);
      
      if (similarity > 0.6 && similarity > bestMatchSimilarity) { // Lower threshold for more aggressive merging
        bestMatchSimilarity = similarity;
        bestMatchKey = key;
        foundMatch = true;
      }
    }
    
    if (foundMatch) {
      // Keep the more concise version
      const existing = finalPoints.get(bestMatchKey)!;
      if (point.original.length < existing.original.length) {
        finalPoints.set(bestMatchKey, point);
      }
    } else {
      finalPoints.set(point.key, point);
    }
  });

  // Return original texts of merged points, sorted by length for readability
  return Array.from(finalPoints.values())
    .map(point => point.original)
    .sort((a, b) => a.length - b.length);
} 
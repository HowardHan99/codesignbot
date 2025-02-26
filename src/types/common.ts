import { RelevanceCategory } from '../services/relevanceService';

/**
 * Component mode type
 */
export type ComponentMode = 'decision' | 'response';

/**
 * Interface for a processed design point
 */
export interface ProcessedDesignPoint {
  proposal: string;
  category?: string;
  explanation?: string;
}

/**
 * Interface for a processed point with relevance information
 */
export interface ProcessedPointWithRelevance extends ProcessedDesignPoint {
  relevance: RelevanceCategory;
  relevanceScore: number;
}

/**
 * Props for components that handle file upload and processing
 */
export interface FileProcessingProps {
  mode: ComponentMode;
  onNewPoints: (points: string[]) => void;
  skipParentCallback?: boolean;
  relevanceThreshold?: number;
}

/**
 * Progress status for file or audio processing
 */
export interface ProcessingStatus {
  isProcessing: boolean;
  progress: number;
  fileName?: string | null;
  shouldStop?: boolean;
}

/**
 * Configuration for creating sticky notes
 */
export interface StickyNoteConfig {
  content: string;
  color: string;
  position: {
    x: number;
    y: number;
  };
  width?: number;
  height?: number;
}

/**
 * Interface for API response from OpenAI
 */
export interface OpenAIResponse {
  response: string;
  timestamp?: number;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Interface for a design decision or point with embedding
 */
export interface DesignPointWithEmbedding {
  content: string;
  embedding?: number[];
  timestamp?: number;
  id?: string;
} 
import { MiroFrameService } from './miro/frameService';
import { MiroImageService } from './miro/imageService';
import { MiroDesignService } from './miro/designService';
import { ConfigurationService } from './configurationService';
import { ProcessedDesignPoint, ProcessedPointWithRelevance } from '../types/common';
import { StickyNoteService } from './miro/stickyNoteService';
import { MiroApiClient } from './miro/miroApiClient';
import { saveConsensusPoints } from '../utils/firebase';
import { Logger } from '../utils/logger';
import { frameConfig } from '../utils/config';

// Log context for this service
const LOG_CONTEXT = 'MIRO-SERVICE';

/**
 * Main service class for Miro operations
 * Acts as a facade for more specific services
 */
export class MiroService {
  /**
   * Retrieves the design challenge from the Design-Challenge frame
   * @returns Promise resolving to the challenge text, or empty string if not found
   */
  public static async getDesignChallenge(): Promise<string> {
    return MiroDesignService.getDesignChallenge();
  }

  /**
   * Cleans the Antagonistic-Response frame by removing all sticky notes within it
   */
  public static async cleanAnalysisBoard(): Promise<void> {
    return MiroDesignService.cleanAnalysisBoard();
  }

  /**
   * Sends synthesized points to the Miro board as a formatted text box
   * @param points - Array of synthesized points to display
   */
  public static async sendSynthesizedPointsToBoard(points: string[]): Promise<void> {
    return MiroDesignService.sendSynthesizedPointsToBoard(points);
  }

  /**
   * Retrieves consensus points from the Consensus frame
   * @returns Promise resolving to an array of consensus points
   */
  public static async getConsensusPoints(sessionId?: string): Promise<string[]> {
    try {
      const points = await MiroDesignService.getConsensusPoints();
      return points;
    } catch (err) {
      Logger.error(LOG_CONTEXT, 'Error getting consensus points:', err);
      return [];
    }
  }

  /**
   * Gets all images from the Sketch-Reference frame and saves them to assets
   * @returns Promise resolving to an array of saved image paths
   */
  public static async getAllImagesFromFrame(): Promise<string[]> {
    return MiroImageService.getAllImagesFromFrame();
  }

  /**
   * Adds new consensus points to the Consensus frame
   * @param points - Array of consensus points to add
   */
  public static async addConsensusPoints(points: string[], sessionId?: string): Promise<void> {
    try {
      Logger.log(LOG_CONTEXT, `Adding ${points.length} consensus points`);
      
      // Convert string points to ProcessedDesignPoint format
      const processedPoints: ProcessedDesignPoint[] = points.map(point => ({
        proposal: point,
        category: 'consensus'  // Mark as consensus category
      }));
      
      // Use the unified method to create sticky notes
      await StickyNoteService.createStickyNotesFromPoints(
        'Consensus',
        processedPoints,
        'decision'  // Use decision mode for styling
      );
      
      // After adding new consensus points, save them to Firebase
      try {
        const boardInfo = await miro.board.getInfo();
        await saveConsensusPoints({
          points,
          boardId: boardInfo.id
        }, sessionId);
        Logger.log(LOG_CONTEXT, `Saved ${points.length} new consensus points to Firebase`);
      } catch (error) {
        Logger.error(LOG_CONTEXT, 'Error saving new consensus points to Firebase:', error);
      }
      
      Logger.log(LOG_CONTEXT, `Added ${points.length} consensus points`);
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error adding consensus points:', error);
      throw error;
    }
  }

  /**
   * Creates sticky notes from design points in a specified frame
   * @param points The design points to create sticky notes for
   * @param frameName The name of the frame to create sticky notes in
   * @param existingConnections Optional array of connections to create between sticky notes
   */
  public static async createStickiesFromPoints(
    points: ProcessedDesignPoint[],
    frameName: string,
    existingConnections?: Array<{from: string, to: string}>
  ): Promise<void> {
    try {
      // Create all sticky notes using the unified method
      await StickyNoteService.createStickyNotesFromPoints(
        frameName,
        points,
        'decision'  // Default to decision mode
      );
      
      // If there are connections to create, we need to fetch the created stickies
      if (existingConnections && existingConnections.length > 0) {
        Logger.log(LOG_CONTEXT, `Creating ${existingConnections.length} connections between sticky notes`);
        
        // Find the frame
        const frame = await MiroFrameService.findFrameByTitle(frameName);
        if (!frame) {
          Logger.error(LOG_CONTEXT, `Frame ${frameName} not found for creating connections`);
          return;
        }
        
        // Get all stickies in the frame
        const frameStickies = await MiroApiClient.getStickiesInFrame(frame.id);
        
        // Create a map of content to sticky
        const stickiesMap = new Map<string, any>();
        for (const sticky of frameStickies) {
          stickiesMap.set(sticky.content, sticky);
        }
        
        // Create connections
        for (const connection of existingConnections) {
          const fromSticky = stickiesMap.get(connection.from);
          const toSticky = stickiesMap.get(connection.to);
          
          if (fromSticky && toSticky) {
            try {
              await miro.board.createConnector({
                start: {
                  item: fromSticky.id,
                  position: { x: 0.5, y: 1 } // Bottom of the sticky
                },
                end: {
                  item: toSticky.id,
                  position: { x: 0.5, y: 0 } // Top of the sticky
                },
                style: {
                  strokeColor: '#4262ff',
                  strokeWidth: 2,
                  strokeStyle: 'normal'
                }
              });
              
              // Add delay between connector creations
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
              Logger.error(LOG_CONTEXT, 'Error creating connector:', error);
            }
          }
        }
      }
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error creating stickies from points:', error);
      throw error;
    }
  }
}

/**
 * Interface for tagged point data 
 */
export interface TaggedPoint {
  pointText: string;
  stickyNoteId: string;
  tags: string[];
  frameLocation: string;
}

/**
 * Simple interface for point-tag mappings to pass to AI
 */
export interface PointTagMapping {
  point: string;
  tags: string[];
}

/**
 * Reads existing tags from antagonistic analysis frames and creates simple point-tag mappings
 * @returns Array of point-tag mappings to pass directly to AI prompts
 */
export async function readPointTagMappings(): Promise<PointTagMapping[]> {
  try {
    Logger.log('MiroService', '=== READING POINT TAG MAPPINGS ===');
    
    // Get all frames to find antagonistic analysis frames
    const allFrames = await miro.board.get({ type: 'frame' });
    
    Logger.log('MiroService', 'All frames on board:', {
      totalFrames: allFrames.length,
      frameNames: allFrames.map(f => ({ title: f.title, id: f.id }))
    });
    
    // Use frame name from config for maintainability - ONLY target Agent-Response frame
    const targetFrameName = frameConfig.names.antagonisticResponse;
    const targetFrames = allFrames.filter(frame => 
      frame.title?.includes(targetFrameName) || 
      // Keep backward compatibility for older frame names
      frame.title?.includes('Antagonistic') || 
      frame.title?.includes('Analysis')
    );
    
    Logger.log('MiroService', 'Filtered target frames for tag reading (Agent-Response only):', {
      targetFrameName: targetFrameName,
      targetFramesCount: targetFrames.length,
      targetFrames: targetFrames.map(f => ({ title: f.title, id: f.id }))
    });

    if (targetFrames.length === 0) {
      Logger.log('MiroService', `No frames found matching "${targetFrameName}" or legacy names for tag reading`);
      return [];
    }

    // Get all sticky notes and tags from the board
    const allStickyNotes = await miro.board.get({ type: 'sticky_note' });
    const boardTags = await miro.board.get({ type: 'tag' });
    
    Logger.log('MiroService', 'Board items retrieved:', {
      totalStickyNotes: allStickyNotes.length,
      totalTags: boardTags.length,
      tagDetails: boardTags.map(tag => ({ id: tag.id, title: tag.title }))
    });
    
    // Create a map of tag IDs to tag titles for quick lookup
    const tagMap = new Map<string, string>();
    boardTags.forEach(tag => {
      tagMap.set(tag.id, tag.title);
    });

    const pointTagMappings: PointTagMapping[] = [];

    // Process sticky notes in target frames
    for (const frame of targetFrames) {
      const frameStickyNotes = allStickyNotes.filter(note => note.parentId === frame.id);
      
      Logger.log('MiroService', `Processing frame "${frame.title}":`, {
        frameId: frame.id,
        stickyNotesInFrame: frameStickyNotes.length,
        stickyNoteDetails: frameStickyNotes.map(note => ({
          id: note.id,
          content: note.content?.substring(0, 50) + '...',
          tagIds: note.tagIds || [],
          hasTagIds: !!(note.tagIds && note.tagIds.length > 0)
        }))
      });
      
      for (const stickyNote of frameStickyNotes) {
        const pointText = stickyNote.content || '';
        
        if (stickyNote.tagIds && stickyNote.tagIds.length > 0) {
          // Get tag titles from tag IDs
          const tags = stickyNote.tagIds
            .map(tagId => tagMap.get(tagId))
            .filter(Boolean) as string[];
          
          Logger.log('MiroService', `Sticky note with tags:`, {
            stickyId: stickyNote.id,
            pointText: pointText.substring(0, 50) + '...',
            tagIds: stickyNote.tagIds,
            resolvedTags: tags
          });
          
          pointTagMappings.push({
            point: pointText,
            tags: tags
          });
        } else {
          // Include untagged points too (with empty tags array)
          Logger.log('MiroService', `Sticky note without tags:`, {
            stickyId: stickyNote.id,
            pointText: pointText.substring(0, 50) + '...',
            tagIds: stickyNote.tagIds || 'undefined'
          });
          
          pointTagMappings.push({
            point: pointText,
            tags: []
          });
        }
      }
    }

    Logger.log('MiroService', `Final point-tag mappings result:`, {
      totalMappings: pointTagMappings.length,
      taggedPoints: pointTagMappings.filter(m => m.tags.length > 0).length,
      untaggedPoints: pointTagMappings.filter(m => m.tags.length === 0).length,
      mappingSummary: pointTagMappings.map(m => ({
        point: m.point.substring(0, 30) + '...',
        tagCount: m.tags.length,
        tags: m.tags
      }))
    });
    
    Logger.log('MiroService', '=== END READING POINT TAG MAPPINGS ===');
    return pointTagMappings;
  } catch (error) {
    Logger.error('MiroService', 'Error reading point-tag mappings from board:', error);
    return [];
  }
}

/**
 * Formats point-tag mappings for AI prompt inclusion
 * @param mappings Array of point-tag mappings
 * @returns Formatted string for AI prompt
 */
export function formatPointTagMappingsForPrompt(mappings: PointTagMapping[]): string {
  if (mappings.length === 0) {
    return '';
  }

  const formattedMappings = mappings.map(mapping => {
    const tagsStr = mapping.tags.length > 0 ? mapping.tags.join(', ') : 'no tags';
    return `"${mapping.point}" - [${tagsStr}]`;
  }).join('\n');

  return `\nPrevious Antagonistic Points with User Tags:\n${formattedMappings}`;
} 
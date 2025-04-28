import { Frame } from '@mirohq/websdk-types';
import { MiroFrameService } from './frameService';
import { frameConfig } from '../../utils/config';

interface ImageData {
  id: string;
  title: string;
  url: string;
  parentId: string;
  x: number;
  y: number;
}

interface SaveImageData {
  id: string;
  fileName: string;
  boardId: string;
  url: string;
}

/**
 * Service for handling Miro image operations
 */
export class MiroImageService {
  /**
   * Gets all images from a frame by its title
   */
  public static async getAllImagesFromFrame(frameTitle: string = frameConfig.names.sketchReference): Promise<string[]> {
    try {
      console.log('Starting to fetch images...');
      
      const sketchFrame = await MiroFrameService.findFrameByTitle(frameTitle);
      if (!sketchFrame) {
        console.log(`${frameTitle} frame not found.`);
        return [];
      }

      // Get all images on board
      console.log('Getting all images on board...');
      const allImages = await miro.board.get({ type: 'image' });
      
      // Log all image details for debugging
      console.log('All images on board:', allImages.map(img => ({
        id: img.id,
        title: img.title,
        url: img.url,
        parentId: img.parentId,
        x: img.x,
        y: img.y
      })));

      // Get images by both parent ID and coordinates
      const frameImages = new Set([
        ...allImages.filter(img => {
          const isInFrame = img.parentId === sketchFrame.id;
          if (isInFrame) {
            console.log('Found image by parentId:', {
              id: img.id,
              title: img.title
            });
          }
          return isInFrame;
        }),
        ...await MiroFrameService.getItemsInFrameBounds(sketchFrame)
      ]);

      const uniqueImages = Array.from(frameImages);
      console.log('Total unique images found:', uniqueImages.length);

      if (uniqueImages.length === 0) {
        console.log(`No images found in ${frameTitle} frame`);
        return [];
      }

      // Get the current board info and prepare URLs
      const boardInfo = await miro.board.getInfo();
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

      // Get the final downloadable URLs for each image
      const downloadableUrls = await Promise.all(uniqueImages.map(async image => {
        try {
          return await this.getDownloadableUrl(image.id, boardInfo.id, origin);
        } catch (error) {
          console.error('Error processing image:', {
            id: image.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          return null;
        }
      }));

      // Filter out any failed URLs
      const validUrls = downloadableUrls.filter((url): url is string => url !== null);
      console.log('All downloadable URLs:', validUrls);

      // Prepare image data for saving
      const imageDataToSave = uniqueImages.map((image, index) => ({
        id: image.id,
        fileName: image.title || `image_${index}.png`,
        boardId: boardInfo.id,
        url: validUrls[index]
      })).filter(data => data.url);

      // Send to save-images endpoint
      const saveUrl = `${origin}/api/save-images`;
      console.log('Sending request to save images:', {
        imageCount: imageDataToSave.length,
        images: imageDataToSave
      });

      const response = await fetch(saveUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ images: imageDataToSave })
      });

      if (!response.ok) {
        throw new Error(`Failed to save images: ${response.status}`);
      }

      const { paths } = await response.json();
      console.log('Images saved successfully:', paths);
      return paths;

    } catch (error) {
      console.error('Error getting images from frame:', error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Gets the downloadable URL for an image
   */
  private static async getDownloadableUrl(imageId: string, boardId: string, origin: string): Promise<string | null> {
    // Step 1: Get the absolute URL
    const absoluteUrl = `${origin}/api/miro/download-image/${imageId}?boardId=${boardId}&format=original`;
    console.log('Generated absolute URL for image:', {
      id: imageId,
      absoluteUrl
    });

    // Step 2: Fetch the data URL from the absolute URL
    const metadataResponse = await fetch(absoluteUrl);
    if (!metadataResponse.ok) {
      throw new Error(`Failed to get metadata: ${metadataResponse.status}`);
    }

    const metadata = await metadataResponse.json();
    console.log('Received metadata response:', {
      id: imageId,
      hasImageUrl: !!metadata.imageUrl,
      dataUrlPreview: metadata.imageUrl?.substring(0, 100) + '...'
    });

    if (!metadata.imageUrl) {
      throw new Error('No image URL in metadata');
    }

    // Step 3: Decode the base64 JSON to get the final URL
    const [header, base64Data] = metadata.imageUrl.split(',');
    console.log('Data URL parts:', {
      header,
      base64Preview: base64Data?.substring(0, 50) + '...'
    });

    if (!base64Data) {
      throw new Error('Invalid data URL format');
    }

    const decodedJson = Buffer.from(base64Data, 'base64').toString('utf-8');
    console.log('Decoded JSON:', {
      id: imageId,
      jsonPreview: decodedJson.substring(0, 100) + '...'
    });

    const imageData = JSON.parse(decodedJson);
    if (!imageData.url) {
      throw new Error('No URL found in decoded JSON');
    }

    console.log('Final downloadable URL:', {
      id: imageId,
      url: imageData.url
    });

    return imageData.url;
  }
} 
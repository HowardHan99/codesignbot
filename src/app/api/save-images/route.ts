import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { mkdir } from 'fs/promises';

export async function POST(request: NextRequest) {
  try {
    const { images } = await request.json();
    console.log('Received request to save images:', {
      imageCount: images.length,
      images: JSON.stringify(images, null, 2)
    });
    const savedPaths: string[] = [];

    // Ensure assets directory exists
    const assetsDir = join(process.cwd(), 'src', 'assets');
    await mkdir(assetsDir, { recursive: true });

    for (const image of images) {
      try {
        const { fileName, url } = image;
        console.log('\n----------------------------------------');
        console.log('Processing image:', {
          fileName,
          url
        });

        if (!url) {
          throw new Error('No URL provided for image');
        }

        // Download the image from the URL
        console.log('\nDownloading image from URL...');
        const imageResponse = await fetch(url);
        console.log('Image download response:', {
          status: imageResponse.status,
          statusText: imageResponse.statusText,
          contentType: imageResponse.headers.get('content-type'),
          contentLength: imageResponse.headers.get('content-length')
        });

        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.status} - ${imageResponse.statusText}`);
        }

        // Save the image
        console.log('\nSaving image to file...');
        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        console.log('Image details:', {
          size: buffer.length,
          fileName,
          contentType: imageResponse.headers.get('content-type')
        });

        const filePath = join(assetsDir, fileName);
        await writeFile(filePath, buffer);
        console.log('Image saved successfully to:', filePath);
        
        savedPaths.push(`/assets/${fileName}`);
        console.log('----------------------------------------\n');

      } catch (error) {
        console.error('\nError processing image:', {
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack
          } : error,
          image: JSON.stringify(image, null, 2)
        });
        // Continue with next image
      }
    }

    if (savedPaths.length === 0) {
      console.error('No images were saved successfully');
      return NextResponse.json(
        { error: 'No images were saved successfully' },
        { status: 500 }
      );
    }

    console.log('\nFinal results:', {
      savedPaths,
      totalSaved: savedPaths.length,
      totalAttempted: images.length
    });

    return NextResponse.json({ paths: savedPaths });
  } catch (error) {
    console.error('Error in save-images API:', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : error
    });
    return NextResponse.json(
      { error: 'Failed to save images' },
      { status: 500 }
    );
  }
} 
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const MIRO_API_URL = 'https://api.miro.com/v2';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get auth token from both cookies and request headers
    const cookieStore = cookies();
    const tokens = cookieStore.get('miro_tokens')?.value || request.headers.get('x-miro-token');
    const state = tokens ? JSON.parse(tokens) : {};
    const accessToken = state.accessToken;

    console.log('Auth check:', {
      hasCookieToken: !!cookieStore.get('miro_tokens')?.value,
      hasHeaderToken: !!request.headers.get('x-miro-token'),
      hasAccessToken: !!accessToken
    });

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get the board ID from the request URL
    const boardId = request.nextUrl.searchParams.get('boardId');
    const format = request.nextUrl.searchParams.get('format') || 'preview'; // Get format parameter, default to preview
    if (!boardId) {
      return NextResponse.json(
        { error: 'Board ID not found' },
        { status: 400 }
      );
    }

    console.log('Fetching image metadata for:', {
      boardId,
      imageId: params.id,
      format,
      hasToken: !!accessToken
    });

    // First get the image metadata
    const metadataResponse = await fetch(
      `${MIRO_API_URL}/boards/${boardId}/images/${params.id}?format=${format}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text();
      console.error('Miro API error:', {
        status: metadataResponse.status,
        statusText: metadataResponse.statusText,
        error: errorText
      });
      return NextResponse.json(
        { error: `Miro API error: ${metadataResponse.statusText}` },
        { status: metadataResponse.status }
      );
    }

    const metadata = await metadataResponse.json();
    console.log('Image metadata:', metadata);

    // Check for image URL in different possible locations in the metadata
    let imageUrl = metadata.imageUrl || metadata.url || metadata.data?.imageUrl || metadata.image?.url;
    
    if (!imageUrl) {
      console.error('No image URL found in metadata:', metadata);
      return NextResponse.json(
        { error: 'No image URL found in metadata' },
        { status: 404 }
      );
    }

    // Replace preview with original in the URL if it exists
    imageUrl = imageUrl.replace('/preview/', '/original/');
    
    // If the URL has a format parameter, replace it with original
    imageUrl = imageUrl.replace(/format=preview/, 'format=original');
    
    // If no format parameter exists, add it
    if (!imageUrl.includes('format=')) {
      imageUrl += (imageUrl.includes('?') ? '&' : '?') + 'format=original';
    }

    console.log('Final image URL with original format:', imageUrl);

    // Now download the actual image data
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!imageResponse.ok) {
      console.error('Failed to download image:', {
        status: imageResponse.status,
        statusText: imageResponse.statusText
      });
      return NextResponse.json(
        { error: `Failed to download image: ${imageResponse.statusText}` },
        { status: imageResponse.status }
      );
    }

    // Get the image data as a blob
    const imageBlob = await imageResponse.blob();
    console.log('Downloaded image blob:', {
      size: imageBlob.size,
      type: imageBlob.type
    });
    
    // Create a data URL from the blob
    const arrayBuffer = await imageBlob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:${imageBlob.type};base64,${base64}`;

    return NextResponse.json({ imageUrl: dataUrl });
  } catch (error) {
    console.error('Error downloading image:', error);
    return NextResponse.json(
      { error: 'Failed to download image' },
      { status: 500 }
    );
  }
} 
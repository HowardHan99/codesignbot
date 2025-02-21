import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Miro } from '@mirohq/miro-api';

const tokensCookie = 'miro_tokens';

interface StorageState {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const boardId = searchParams.get('board_id');

    if (!code) {
      return NextResponse.redirect('/');
    }

    let savedState: StorageState | undefined;

    // Initialize Miro client
    const miro = new Miro({
      storage: {
        get: async (userId: string) => {
          // Return empty state for initial auth
          return {
            userId,
            accessToken: '',
          };
        },
        set: async (userId: string, state: StorageState | undefined) => {
          if (state) {
            savedState = state;
            // Save the tokens in a cookie with options
            cookies().set(tokensCookie, JSON.stringify(state), {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/'
            });
          }
        },
      },
    });

    // Exchange the code for tokens
    await miro.exchangeCodeForAccessToken(code, state || '');

    // Get the access token from the saved state
    if (!savedState?.accessToken) {
      console.error('No access token found after exchange');
      return NextResponse.redirect('/');
    }

    // Redirect back to the main page with board ID and access token
    const redirectUrl = new URL('/', request.url);
    if (boardId) {
      redirectUrl.searchParams.set('board_id', boardId);
      redirectUrl.searchParams.set('access_token', savedState.accessToken);
      console.log('Redirecting with token:', {
        boardId,
        accessToken: savedState.accessToken.substring(0, 10) + '...',
        redirectUrl: redirectUrl.toString()
      });
    }
    
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Error in redirect handler:', error);
    return NextResponse.redirect('/');
  }
} 
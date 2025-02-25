'use client';

import React from 'react';
import { BoardDisplay } from '../components/BoardDisplay';
import { getMiroAuth } from '../utils/miroClient';
import BoardTokenManager from '../utils/boardTokenManager';
import '../assets/style.css';

interface BoardAuth {
  boardId: string;
  authUrl: string;
  isAuthorized: boolean;
  name?: string;
}

interface SerializedBoard {
  id: string;
  name: string;
}

export default function Page() {
  const [boardAuths, setBoardAuths] = React.useState<BoardAuth[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [refreshTrigger, setRefreshTrigger] = React.useState(0);
  const [newBoardId, setNewBoardId] = React.useState('');

  // Handle redirect with token
  React.useEffect(() => {
    // Save the default token from env
    if (process.env.NEXT_PUBLIC_MIRO_OAUTH_TOKEN && process.env.NEXT_PUBLIC_MIRO_BOARD_ID) {
      BoardTokenManager.saveToken(process.env.NEXT_PUBLIC_MIRO_BOARD_ID, process.env.NEXT_PUBLIC_MIRO_OAUTH_TOKEN);
      // Force authorized state for the default board
      setBoardAuths([{
        boardId: process.env.NEXT_PUBLIC_MIRO_BOARD_ID!,
        authUrl: '',
        isAuthorized: true,
        name: 'Default Board'
      }]);
      setIsLoading(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const boardId = params.get('board_id');
    const accessToken = params.get('access_token');

    if (boardId && accessToken) {
      BoardTokenManager.saveToken(boardId, accessToken);
      
      // Clean up URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('board_id');
      newUrl.searchParams.delete('access_token');
      window.history.replaceState({}, '', newUrl);
      
      // Trigger a refresh of auth status
      setRefreshTrigger(prev => prev + 1);
    }
  }, []);

  // Handle auth checking
  React.useEffect(() => {
    async function checkAuth() {
      try {
        setIsLoading(true);
        const defaultAuth = await getMiroAuth();
        const storedTokens = BoardTokenManager.getAllTokens();
        
        // If we have the default board token, use only that
        if (process.env.NEXT_PUBLIC_MIRO_BOARD_ID && storedTokens.has(process.env.NEXT_PUBLIC_MIRO_BOARD_ID)) {
          setBoardAuths([{
            boardId: process.env.NEXT_PUBLIC_MIRO_BOARD_ID,
            authUrl: '',
            isAuthorized: true,
            name: 'Default Board'
          }]);
          setIsLoading(false);
          return;
        }

        const additionalAuths = Array.from(storedTokens.entries()).map(([boardId, token]) => ({
          boardId,
          authUrl: defaultAuth.authUrl,
          isAuthorized: true,
          name: `Board ${boardId}`
        }));

        const allAuths = [
          { 
            boardId: 'default', 
            authUrl: defaultAuth.authUrl, 
            isAuthorized: defaultAuth.isAuthorized,
            name: 'Default Board'
          },
          ...additionalAuths
        ];

        setBoardAuths(allAuths);
      } catch (error) {
        console.error('Error checking auth:', error);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, [refreshTrigger]);

  const handleAddBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardId) return;

    const boardAuth = {
      boardId: newBoardId,
      authUrl: `https://miro.com/oauth/authorize?response_type=code&client_id=${process.env.NEXT_PUBLIC_MIRO_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin + '/api/miro/redirect')}&board_id=${newBoardId}`,
      isAuthorized: false,
      name: `Board ${newBoardId}`
    };

    setBoardAuths(prev => [...prev, boardAuth]);
    setNewBoardId('');
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const serializedBoards: SerializedBoard[] = boardAuths
    .filter(auth => auth.isAuthorized)
    .map(auth => ({
      id: auth.boardId,
      name: auth.name || `Board ${auth.boardId}`
    }));

  // Check if any board needs authorization
  const unauthorizedBoards = boardAuths.filter(auth => !auth.isAuthorized);
  const needsAuth = unauthorizedBoards.length > 0;

  // If we have authorized boards, only show BoardDisplay
  if (serializedBoards.length > 0) {
    return <BoardDisplay boards={serializedBoards} />;
  }

  // Otherwise, show the auth UI
  return (
    <div>
      {/* Add new board form */}
      <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f5f5f7', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Add Another Board</h3>
        <form onSubmit={handleAddBoard} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={newBoardId}
            onChange={(e) => setNewBoardId(e.target.value)}
            placeholder="Enter Board ID"
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #c3c2cf'
            }}
          />
          <button 
            type="submit" 
            className="button button-primary"
            disabled={!newBoardId}
          >
            Add Board
          </button>
        </form>
      </div>

      {/* Authorization needed section */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ marginBottom: '12px' }}>Authorization Needed</h3>
        {unauthorizedBoards.map((auth) => (
          <div key={auth.boardId} style={{ marginBottom: '10px' }}>
            <a 
              className="button button-primary" 
              href={auth.authUrl}
              target="_blank"
              style={{ display: 'block', textAlign: 'center' }}
            >
              Login to {auth.name}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

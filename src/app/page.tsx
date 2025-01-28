import React from 'react';
import {Board, StickyNoteItem, FrameItem} from '@mirohq/miro-api';
import initMiroAPI from '../utils/initMiroAPI';
import { BoardDisplay } from '../components/BoardDisplay';
import '../assets/style.css';

const getBoards = async () => {
  const {miro, userId} = initMiroAPI();

  // redirect to auth url if user has not authorized the app
  if (!userId || !(await miro.isAuthorized(userId))) {
    return {
      authUrl: miro.getAuthUrl(),
    };
  }

  const api = miro.as(userId);

  const boards: Board[] = [];
  for await (const board of api.getAllBoards()) {
    boards.push(board);
  }

  // Serialize board data
  const serializedBoards = boards.map(board => ({
    id: board.id,
    name: board.name
  }));

  return {
    boards: serializedBoards,
  };
};

const getStickyNotesContent = async (boardId: string) => {
  const { miro, userId } = initMiroAPI();

  // Ensure the user is authorized
  if (!userId || !(await miro.isAuthorized(userId))) {
    throw new Error('User is not authorized');
  }

  const api = miro.as(userId);

  try {
    const board = await api.getBoard(boardId);
    const stickyNotes: string[] = [];
    let designFrameId: string | null = null;

    // First pass: find the Design-Decision frame
    for await (const item of board.getAllItems()) {
      if (
        item instanceof FrameItem && 
        item.data?.title === 'Design-Decision'
      ) {
        designFrameId = item.id;
        break;
      }
    }

    if (!designFrameId) {
      console.log('No Design-Decision frame found');
      return [];
    }

    // Second pass: collect sticky notes within the frame
    for await (const item of board.getAllItems()) {
      if (
        item instanceof StickyNoteItem && 
        item.parent?.id === designFrameId
      ) {
        const content = item.data?.content || '';
        stickyNotes.push(content.replace(/<p>/g, '').replace(/<\/p>/g, ''));
      }
    }

    return stickyNotes;
  } catch (error) {
    console.error('Error fetching sticky notes:', error);
    throw error;
  }
};

export default async function Page() {
  const {boards, authUrl} = await getBoards();
  if (!boards) {
    return <div>No boards found</div>;
  }
  const stickyNotes = await getStickyNotesContent(boards[0].id);
  
  return (
    <div>
      <h3>API usage demo</h3>
      <p className="p-small">API Calls need to be authenticated</p>
      <p>
        Apps that use the API usually would run on your own domain. During
        development, test on http://localhost:3000
      </p>
      {authUrl ? (
        <a className="button button-primary" href={authUrl} target="_blank">
          Login
        </a>
      ) : (
        <BoardDisplay boards={boards} stickyNotes={stickyNotes} />
      )}
    </div>
  );
}

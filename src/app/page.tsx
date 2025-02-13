'use client';

import React from 'react';
import { BoardDisplay } from '../components/BoardDisplay';
import { getMiroAuth } from '../utils/miroClient';
import '../assets/style.css';

export default function Page() {
  const [authUrl, setAuthUrl] = React.useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = React.useState(false);
  const [boards, setBoards] = React.useState<any[]>([]);

  React.useEffect(() => {
    const checkAuth = async () => {
      const auth = await getMiroAuth();
      setAuthUrl(auth.authUrl);
      setIsAuthorized(auth.isAuthorized);
    };
    
    checkAuth();
  }, []);

  return (
    <div>
      {/* <h3>Co-Design Agent</h3>
      <p>
        Apps that use the API usually would run on your own domain. During
        development, test on http://localhost:3000
      </p> */}
      {authUrl && !isAuthorized ? (
        <a className="button button-primary" href={authUrl} target="_blank">
          Login
        </a>
      ) : (
        <BoardDisplay boards={boards} />
      )}
    </div>
  );
}

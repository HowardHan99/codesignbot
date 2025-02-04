'use client';

import React, { useEffect, useState } from 'react';
import { BoardDisplay } from '../components/BoardDisplay';
import { getMiroAuth } from '../utils/miroClient';
import '../assets/style.css';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBsHoAvguKeV8XnT6EkV2Q0hyAv6OEw8bo",
  authDomain: "codesignagent-f4420.firebaseapp.com",
  databaseURL: "https://codesignagent-f4420-default-rtdb.firebaseio.com",
  projectId: "codesignagent-f4420",
  storageBucket: "codesignagent-f4420.firebasestorage.app",
  messagingSenderId: "121164910498",
  appId: "1:121164910498:web:552f246dc0a3f28792ecfb",
  measurementId: "G-YKVCSPS593"
};

export { firebaseConfig };

export default function Page() {
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [boards, setBoards] = useState<any[]>([]);

  useEffect(() => {
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

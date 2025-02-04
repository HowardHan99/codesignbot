'use client';

import { useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { firebaseConfig } from '../app/page';

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const initFirebase = async () => {
      const app = initializeApp(firebaseConfig);
      if (await isSupported()) {
        getAnalytics(app);
      }
    };
    
    initFirebase().catch(console.error);
  }, []);

  return <>{children}</>;
} 
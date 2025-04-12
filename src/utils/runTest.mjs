// Node.js script to test Firestore with a minimal document
// Run with: node --experimental-modules src/utils/runTest.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

// Firebase configuration - replace with your own values from Firebase console
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testMinimalDocument() {
  try {
    console.log('🧪 TESTING MINIMAL DOCUMENT WRITE TO FIRESTORE');
    console.log('==============================================');
    
    // Create the simplest possible test document
    const tinyDoc = {
      title: 'Tiny Test',
      content: 'ABC',
      timestamp: new Date(),
      // Absolutely minimal 3-element "embedding"
      embedding: [0.1, 0.2, 0.3]
    };
    
    console.log('Document to write:', tinyDoc);
    console.log('Attempting to write to DesignKnowledge collection...');
    
    const docRef = await addDoc(collection(db, 'DesignKnowledge'), tinyDoc);
    
    console.log('✅ SUCCESS! Document written with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ ERROR:', error);
    return null;
  }
}

// Run the test
testMinimalDocument()
  .then(docId => {
    console.log('Test complete. Document ID:', docId);
    // We need to force exit since Firebase keeps connections open
    setTimeout(() => process.exit(0), 2000);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  }); 
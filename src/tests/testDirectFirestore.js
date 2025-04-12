// Direct Firestore test - bypasses most of the knowledge pipeline
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { firebaseConfig } from '../utils/config';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testDirectFirestore() {
  console.log('🧪 TESTING DIRECT FIRESTORE WRITE');
  console.log('=================================');
  
  try {
    // Create a minimal test document
    const minimalDoc = {
      title: 'Minimal Test',
      content: 'Simple test.',
      type: 'test',
      tags: ['test'],
      timestamp: new Date(),
      // Tiny embedding vector (just 10 dimensions)
      embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    };
    
    console.log('Writing minimal document to Firestore...');
    
    // Try to write to the DesignKnowledge collection
    const docRef = await addDoc(collection(db, 'DesignKnowledge'), minimalDoc);
    
    console.log('✅ SUCCESS: Document written successfully!');
    console.log('Document ID:', docRef.id);
    
    return docRef.id;
  } catch (error) {
    console.error('❌ ERROR WRITING TO FIRESTORE:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        code: error.code
      });
    }
    return null;
  }
}

// Run the test
testDirectFirestore().then(id => {
  console.log('\n=================================');
  console.log('Test complete. Document ID:', id);
}).catch(err => {
  console.error('Test script error:', err);
});

export { testDirectFirestore }; 
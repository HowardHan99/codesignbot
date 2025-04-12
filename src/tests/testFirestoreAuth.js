// Test Firestore authentication and permissions
import { getFirestore, collection, getDocs, addDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { firebaseConfig } from '../utils/config';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function testFirestoreAuth() {
  console.log('🧪 TESTING FIRESTORE AUTHENTICATION');
  console.log('=================================');
  
  try {
    // Try anonymous authentication first
    console.log('1. Attempting anonymous authentication...');
    const userCredential = await signInAnonymously(auth);
    console.log('✅ Anonymous auth successful, user ID:', userCredential.user.uid);
    
    // Try reading the collection first (read permissions test)
    console.log('\n2. Testing read permissions...');
    const querySnapshot = await getDocs(collection(db, 'DesignKnowledge'));
    console.log(`✅ Read successful. Collection has ${querySnapshot.size} documents.`);
    
    // Now try writing a minimal document to test write permissions
    console.log('\n3. Testing write permissions...');
    const minimalDoc = {
      title: 'Auth Test Document',
      content: 'Testing auth and permissions.',
      timestamp: new Date(),
      // No embedding to minimize potential issues
    };
    
    const docRef = await addDoc(collection(db, 'DesignKnowledge'), minimalDoc);
    console.log('✅ Write successful! Document ID:', docRef.id);
    
    console.log('\n🎉 All tests passed. Your Firestore permissions are working correctly.');
    return true;
  } catch (error) {
    console.error('❌ TEST FAILED:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        code: (error).code
      });
      
      // Suggest fixes based on error
      if (error.message.includes('permission-denied') || error.message.includes('Permission denied')) {
        console.error('\n🔒 PERMISSION ISSUE DETECTED:');
        console.error('Update your Firestore rules to:');
        console.error(`
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /DesignKnowledge/{document=**} {
      allow read, write: if true;  // For testing only!
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}`);
      } else if (error.message.includes('auth')) {
        console.error('\n🔑 AUTHENTICATION ISSUE:');
        console.error('Enable Anonymous Authentication in your Firebase console.');
      }
    }
    return false;
  }
}

// Run the test
testFirestoreAuth().then(success => {
  console.log('\n=================================');
  console.log('Auth test complete. Success:', success);
}).catch(err => {
  console.error('Test script error:', err);
});

export { testFirestoreAuth }; 
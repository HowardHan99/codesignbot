// Node.js script to test vector search functionality
// Run with: node --experimental-modules src/tests/runVectorSearchTest.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import fetch from 'node-fetch';

// Firebase configuration
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

// Simple function to generate embedding via OpenAI API
// Note: You'll need to add your own OpenAI API key for this to work
async function getEmbedding(text) {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` // Set this env var
      },
      body: JSON.stringify({
        input: text,
        model: "text-embedding-3-small"
      })
    });
    
    const data = await response.json();
    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error('Invalid response from OpenAI API: ' + JSON.stringify(data));
    }
    
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Function to calculate cosine similarity
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magA * magB);
}

async function searchVectorSimilarity() {
  console.log('🔍 TESTING VECTOR SIMILARITY SEARCH');
  console.log('===================================');
  
  try {
    // The search query
    const searchQuery = "what is a wicked problem";
    console.log(`Query: "${searchQuery}"`);
    
    // Generate embedding for the query (requires OpenAI API key)
    console.log('Generating embedding for query...');
    
    let queryEmbedding;
    try {
      queryEmbedding = await getEmbedding(searchQuery);
      console.log(`✓ Generated embedding (${queryEmbedding.length} dimensions)`);
    } catch (error) {
      console.error('❌ Failed to generate embedding. Using text search fallback.');
      // Continue with text-based search
    }
    
    // Fetch all documents from the DesignKnowledge collection
    console.log('Fetching documents from Firestore...');
    const querySnapshot = await getDocs(collection(db, 'DesignKnowledge'));
    
    console.log(`Retrieved ${querySnapshot.size} documents from Firestore`);
    
    // Convert to array for processing
    const documents = [];
    querySnapshot.forEach(doc => {
      documents.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`Processing ${documents.length} documents...`);
    
    let results;
    
    // If we have embeddings, do vector similarity search
    if (queryEmbedding) {
      // Calculate similarity for each document
      const scoredDocs = documents.map(doc => {
        // Skip documents without embeddings
        if (!doc.embedding || !Array.isArray(doc.embedding)) {
          return { doc, similarity: 0 };
        }
        
        const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
        return { doc, similarity };
      });
      
      // Sort by similarity score (highest first)
      results = scoredDocs
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5) // Top 5 results
        .map(({ doc, similarity }) => ({ ...doc, similarity }));
    } else {
      // Fallback to simple text search
      results = documents.filter(doc => 
        doc.content && doc.content.toLowerCase().includes("wicked problem")
      ).slice(0, 5);
    }
    
    // Check for the target document
    const targetDocId = "5GLelxXjELIhyiZ7fISj";
    const targetDocFound = results.some(doc => doc.id === targetDocId);
    
    console.log('\n🎯 SEARCH RESULTS:');
    
    // Print results
    results.forEach((doc, i) => {
      const isTarget = doc.id === targetDocId;
      console.log(`\n${isTarget ? '✓ [TARGET]' : `${i+1}.`} Document ID: ${doc.id}`);
      
      if (doc.similarity !== undefined) {
        console.log(`Similarity score: ${doc.similarity.toFixed(4)}`);
      }
      
      console.log(`Title: ${doc.title || 'No title'}`);
      if (doc.content) {
        console.log(`Content preview: ${doc.content.substring(0, 150)}...`);
      }
      
      const containsWickedProblem = doc.content && 
        doc.content.toLowerCase().includes("wicked problem");
      console.log(`Contains "wicked problem": ${containsWickedProblem ? 'YES ✓' : 'NO ❌'}`);
    });
    
    if (targetDocFound) {
      console.log('\n🎉 SUCCESS! Target document found in search results.');
    } else {
      // Check if any document has wicked problem content
      const anyWickedDoc = results.some(doc => 
        doc.content && doc.content.toLowerCase().includes("wicked problem"));
      
      if (anyWickedDoc) {
        console.log('\n✅ Found relevant document about wicked problems!');
      } else {
        console.log('\n❌ No documents about wicked problems found.');
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error during search:', error);
    return [];
  } finally {
    // Force exit (Firebase keeps connections open)
    setTimeout(() => process.exit(0), 3000);
  }
}

// Run the search
searchVectorSimilarity().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 
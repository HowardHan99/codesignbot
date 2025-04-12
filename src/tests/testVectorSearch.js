// Test for vector search functionality
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { EmbeddingService } from '../services/embeddingService';
import { KnowledgeService } from '../services/knowledgeService';
import { firebaseConfig } from '../utils/config';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testVectorSearch() {
  console.log('🔍 TESTING VECTOR SEARCH FUNCTIONALITY');
  console.log('=====================================');
  
  try {
    // The query we want to search for
    const query = "what is a wicked problem";
    console.log(`Query: "${query}"`);
    
    // Generate embedding for the query
    console.log('Generating embedding for query...');
    const embedding = await EmbeddingService.getEmbedding(query);
    console.log(`✓ Generated embedding (${embedding.length} dimensions)`);
    
    // Perform the similarity search
    console.log('Performing vector similarity search...');
    const results = await KnowledgeService.retrieveRelevantKnowledge(embedding, 5);
    
    console.log(`\n✅ Search complete! Found ${results.length} relevant documents`);
    
    // Check if the expected document is in the results
    const targetDocumentId = "5GLelxXjELIhyiZ7fISj";
    const foundTargetDoc = results.find(doc => doc.id === targetDocumentId);
    
    console.log('\n🎯 SEARCH RESULTS:');
    
    // Display results
    results.forEach((doc, index) => {
      const isTarget = doc.id === targetDocumentId;
      const prefix = isTarget ? '✓ [TARGET FOUND]' : `${index + 1}.`;
      
      console.log(`\n${prefix} Document ID: ${doc.id}`);
      console.log(`Title: ${doc.title}`);
      console.log(`Content preview: ${doc.content.substring(0, 150)}...`);
      
      // Check if content contains wicked problem
      const containsWickedProblem = doc.content.includes("wicked problem");
      console.log(`Contains "wicked problem": ${containsWickedProblem ? 'YES ✓' : 'NO ❌'}`);
    });
    
    // Final result
    if (foundTargetDoc) {
      console.log('\n🎉 SUCCESS! The target document was found in the search results.');
      console.log('Vector search is working correctly.');
    } else {
      console.log('\n❌ The specific target document was not found, but check if any');
      console.log('of the returned documents contain information about wicked problems.');
      
      // Check if any document mentions wicked problems
      const anyWickedDoc = results.some(doc => 
        doc.content.toLowerCase().includes("wicked problem"));
      
      if (anyWickedDoc) {
        console.log('\n✅ Found a document that mentions "wicked problem"!');
        console.log('Vector search is working, but returned a different document than expected.');
      } else {
        console.log('\n❌ No documents mentioning "wicked problem" were found.');
        console.log('Vector search may need improvement or the document might not be in the collection.');
      }
    }
    
    return results;
  } catch (error) {
    console.error('❌ ERROR DURING VECTOR SEARCH TEST:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name
      });
    }
    return [];
  }
}

// Run the test
testVectorSearch().then(results => {
  console.log('\n=====================================');
  console.log('Test complete.');
}).catch(err => {
  console.error('Test script error:', err);
});

export { testVectorSearch }; 
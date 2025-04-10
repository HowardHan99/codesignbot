import { KnowledgeService } from '../services/knowledgeService';
import { bootstrapKnowledgeBase } from './bootstrapKnowledge';

// Test queries for validating knowledge retrieval
const TEST_QUERIES = [
  'What is a wicked problem and what are some examples?',
  'What are the characteristics of wicked problems?',
  'How do complex socio-technical systems relate to wicked problems?',
  'How can systems thinking and agile methodology help with wicked problems?'
];

/**
 * Test utility for the knowledge service
 * This can be called from a component or the browser console for testing
 */
export async function testKnowledgeService() {
  console.log('🧪 Starting Knowledge Service Test');
  
  try {
    // Step 1: Check if knowledge base has documents
    console.log('Step 1: Checking existing documents...');
    const existingDocs = await KnowledgeService.listDocuments();
    console.log(`Found ${existingDocs.length} existing documents`);
    
    // Step 2: If no documents exist, bootstrap the knowledge base
    if (existingDocs.length === 0) {
      console.log('Step 2: No documents found, bootstrapping knowledge base...');
      const docIds = await bootstrapKnowledgeBase();
      console.log(`Bootstrapped ${docIds.length} documents`);
    } else {
      console.log('Step 2: Skipped bootstrapping as documents already exist');
    }
    
    // Step 3: Test document retrieval
    console.log('Step 3: Testing knowledge retrieval...');
    
    for (const query of TEST_QUERIES) {
      console.log(`\nQuery: "${query}"`);
      const start = performance.now();
      const results = await KnowledgeService.retrieveRelevantKnowledge(query, undefined, 2);
      const end = performance.now();
      
      console.log(`Retrieved ${results.length} relevant documents in ${(end - start).toFixed(2)}ms`);
      
      if (results.length > 0) {
        console.log('Top result:');
        console.log(`- Title: ${results[0].title}`);
        console.log(`- Type: ${results[0].type}`);
        console.log(`- Tags: ${results[0].tags.join(', ')}`);
        console.log(`- Similarity: ${(results[0] as any).similarity.toFixed(4)}`);
        console.log(`- Content: ${results[0].content.substring(0, 100)}...`);
      } else {
        console.log('No relevant documents found');
      }
    }
    
    console.log('\n✅ Knowledge Service Test Completed Successfully');
    return true;
  } catch (error) {
    console.error('❌ Knowledge Service Test Failed:', error);
    return false;
  }
}

// Add function to the window object for easy console access
if (typeof window !== 'undefined') {
  (window as any).testKnowledgeService = testKnowledgeService;
  console.log('Knowledge service test utility added to window. Run testKnowledgeService() in console to test.');
}

/**
 * Run test queries against the knowledge base
 */
export async function testKnowledgeRetrieval(): Promise<void> {
  console.log('Testing knowledge retrieval...\n');
  
  for (const query of TEST_QUERIES) {
    try {
      console.log(`Query: "${query}"`);
      const results = await KnowledgeService.retrieveRelevantKnowledge(query);
      console.log('Results:', results);
      console.log('\n---\n');
    } catch (error) {
      console.error(`Error testing query "${query}":`, error);
    }
  }
  
  console.log('Knowledge retrieval testing complete!');
} 
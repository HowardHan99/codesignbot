import { KnowledgeService } from '../services/knowledgeService';
import { bootstrapKnowledgeBase } from './bootstrapKnowledge';

// Test queries for validating knowledge retrieval
const TEST_QUERIES = [
  'What is a wicked problem and what are some examples?',
  'What are the characteristics of wicked problems?',
  'How do complex socio-technical systems relate to wicked problems?',
  'How can systems thinking and agile methodology help with wicked problems?'
];

interface ErrorWithStack extends Error {
  stack?: string;
}

/**
 * Test utility for the knowledge service
 * This can be called from a component or the browser console for testing
 */
export async function testKnowledgeService() {
  console.log('🧪 Starting Knowledge Service Test');
  console.log('=====================================');
  
  try {
    // Step 1: Check if knowledge base has documents
    console.log('\n📊 Step 1: Checking existing documents...');
    const existingDocs = await KnowledgeService.listDocuments();
    console.log(`Found ${existingDocs.length} existing documents`);
    if (existingDocs.length > 0) {
      console.log('Sample document structure:');
      console.log(JSON.stringify(existingDocs[0], null, 2));
    }
    
    // Step 2: If no documents exist, bootstrap the knowledge base
    if (existingDocs.length === 0) {
      console.log('\n🚀 Step 2: No documents found, bootstrapping knowledge base...');
      console.log('Starting bootstrap process...');
      try {
        const docIds = await bootstrapKnowledgeBase();
        console.log('Bootstrap completed successfully');
        console.log(`Added ${docIds.length} documents with IDs:`);
        docIds.forEach((id, index) => {
          console.log(`${index + 1}. ${id}`);
        });
      } catch (bootstrapError) {
        const error = bootstrapError as ErrorWithStack;
        console.error('❌ Bootstrap process failed:', error.message);
        console.error('Stack trace:', error.stack);
        throw error;
      }
    } else {
      console.log('\n⏭️ Step 2: Skipped bootstrapping as documents already exist');
    }
    
    // Step 3: Test document retrieval
    console.log('\n🔍 Step 3: Testing knowledge retrieval...');
    console.log('Testing each query with detailed performance metrics...');
    
    for (const query of TEST_QUERIES) {
      console.log('\n-----------------------------------');
      console.log(`📝 Testing query: "${query}"`);
      
      const start = performance.now();
      try {
        const results = await KnowledgeService.retrieveRelevantKnowledge(query, undefined, 2);
        const end = performance.now();
        const duration = (end - start).toFixed(2);
        
        console.log(`⏱️ Query completed in ${duration}ms`);
        console.log(`📚 Retrieved ${results.length} relevant documents`);
        
        if (results.length > 0) {
          console.log('\n🏆 Top result details:');
          console.log('------------------------');
          console.log(`Title: ${results[0].title}`);
          console.log(`Type: ${results[0].type}`);
          console.log(`Tags: ${results[0].tags.join(', ')}`);
          if ((results[0] as any).similarity !== undefined) {
            console.log(`Similarity score: ${(results[0] as any).similarity.toFixed(4)}`);
          }
          console.log('\nContent preview:');
          console.log('---------------');
          console.log(`${results[0].content.substring(0, 150)}...`);
        } else {
          console.log('⚠️ No relevant documents found for this query');
        }
      } catch (queryError) {
        const error = queryError as ErrorWithStack;
        console.error(`❌ Error processing query "${query}":`, error.message);
        console.error('Stack trace:', error.stack);
      }
    }
    
    console.log('\n✅ Knowledge Service Test Completed Successfully');
    console.log('=====================================');
    return true;
  } catch (error) {
    const err = error as ErrorWithStack;
    console.error('\n❌ Knowledge Service Test Failed');
    console.error('=====================================');
    console.error('Error details:', err.message);
    console.error('Stack trace:', err.stack);
    return false;
  }
}

// Add function to the window object for easy console access
if (typeof window !== 'undefined') {
  (window as any).testKnowledgeService = testKnowledgeService;
  console.log('💡 Knowledge service test utility added to window. Run testKnowledgeService() in console to test.');
}

/**
 * Run test queries against the knowledge base
 */
export async function testKnowledgeRetrieval(): Promise<void> {
  console.log('🔍 Testing knowledge retrieval...');
  console.log('=====================================');
  
  for (const query of TEST_QUERIES) {
    try {
      console.log(`\n📝 Testing query: "${query}"`);
      const start = performance.now();
      const results = await KnowledgeService.retrieveRelevantKnowledge(query);
      const end = performance.now();
      
      console.log(`⏱️ Query completed in ${(end - start).toFixed(2)}ms`);
      console.log('Results:', JSON.stringify(results, null, 2));
      console.log('\n-----------------------------------');
    } catch (error) {
      const err = error as ErrorWithStack;
      console.error(`❌ Error testing query "${query}":`);
      console.error('Error details:', err.message);
      console.error('Stack trace:', err.stack);
      console.log('\n-----------------------------------');
    }
  }
  
  console.log('\n✅ Knowledge retrieval testing complete!');
  console.log('=====================================');
} 
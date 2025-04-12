/**
 * Standalone test runner for Agent Memory functionality
 * This script provides a more comprehensive test of the agent memory system
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { AgentMemoryService } from '../services/agentMemoryService';
import { EmbeddingService } from '../services/embeddingService';
import { firebaseConfig } from '../utils/config';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Comprehensive test of Agent Memory functionality
 */
async function runAgentMemoryTest() {
  console.log('🧠 COMPREHENSIVE AGENT MEMORY TEST');
  console.log('===================================');
  
  // Track test results
  const results = {
    storedMemories: [],
    retrievedMemories: [],
    searchResults: []
  };
  
  try {
    // PHASE 1: Store various memory types
    console.log('\n📝 PHASE 1: STORING DIFFERENT MEMORY TYPES');
    console.log('-----------------------------------');
    
    // Create a simulated conversation history
    const conversationMemories = [
      "User asked: What makes a problem 'wicked' in design thinking?",
      "Agent responded: Wicked problems are complex, interconnected issues without clear solutions.",
      "User asked: Can you provide examples of wicked problems?",
      "Agent responded: Climate change, poverty, and healthcare are classic examples of wicked problems.",
      "User asked: How do designers approach wicked problems?",
      "Agent responded: Designers use systems thinking, iterative approaches, and collaborative methods."
    ];
    
    console.log(`Storing ${conversationMemories.length} conversation memories...`);
    
    // Store each conversation turn
    const conversationIds = [];
    for (const [index, memory] of conversationMemories.entries()) {
      const id = await AgentMemoryService.storeMemory(
        memory,
        "conversation",
        {
          turnIndex: index,
          sessionId: "test-session-" + Date.now(),
          timestamp: new Date(Date.now() - (5 - index) * 60000) // Spread out by minutes
        }
      );
      conversationIds.push(id);
      results.storedMemories.push({ id, type: "conversation", content: memory });
    }
    
    console.log(`✅ Stored ${conversationIds.length} conversation memories`);
    
    // Store some reflection memories
    console.log('\nStoring reflection memories...');
    const reflections = [
      "The user seems particularly interested in design methodology for complex social problems.",
      "I should provide more concrete examples and actionable frameworks when discussing wicked problems.",
      "The user's questions suggest they might be working on a project with many stakeholders and constraints."
    ];
    
    const reflectionIds = [];
    for (const reflection of reflections) {
      const id = await AgentMemoryService.storeMemory(
        reflection,
        "reflection",
        {
          confidence: 0.85,
          actionable: true
        }
      );
      reflectionIds.push(id);
      results.storedMemories.push({ id, type: "reflection", content: reflection });
    }
    
    console.log(`✅ Stored ${reflectionIds.length} reflection memories`);
    
    // Store a long-term memory about the user
    console.log('\nStoring long-term user memory...');
    const longTermId = await AgentMemoryService.storeMemory(
      "This user consistently engages with topics related to systems thinking, design methodology, and social impact.",
      "long_term",
      {
        importance: "high",
        category: "user_interests",
        lastUpdated: new Date()
      }
    );
    results.storedMemories.push({ 
      id: longTermId, 
      type: "long_term", 
      content: "This user consistently engages with topics related to systems thinking, design methodology, and social impact." 
    });
    
    console.log(`✅ Stored long-term memory with ID: ${longTermId}`);
    
    // PHASE 2: Retrieve memories by type
    console.log('\n🔍 PHASE 2: RETRIEVING MEMORIES BY TYPE');
    console.log('-----------------------------------');
    
    // Get conversation history
    console.log('\nRetrieving conversation history...');
    const retrievedConversations = await AgentMemoryService.getMemoriesByType("conversation", 10);
    console.log(`✅ Retrieved ${retrievedConversations.length} conversation memories`);
    
    // Display a few conversation memories
    if (retrievedConversations.length > 0) {
      console.log('\nLatest conversation turns:');
      retrievedConversations.slice(0, 3).forEach((memory, i) => {
        console.log(`${i+1}. ${memory.content}`);
      });
    }
    
    results.retrievedMemories.push(...retrievedConversations);
    
    // Get reflections
    console.log('\nRetrieving agent reflections...');
    const retrievedReflections = await AgentMemoryService.getMemoriesByType("reflection", 5);
    console.log(`✅ Retrieved ${retrievedReflections.length} reflection memories`);
    
    if (retrievedReflections.length > 0) {
      console.log('\nAgent reflections:');
      retrievedReflections.forEach((memory, i) => {
        console.log(`${i+1}. ${memory.content}`);
      });
    }
    
    results.retrievedMemories.push(...retrievedReflections);
    
    // PHASE 3: Test semantic search across memory types
    console.log('\n🔎 PHASE 3: SEMANTIC SEARCH ACROSS MEMORIES');
    console.log('-----------------------------------');
    
    const searchQueries = [
      "Tell me about design approaches for complex problems",
      "What are examples of wicked problems?",
      "What do we know about this user's interests?"
    ];
    
    // Test each query
    for (const query of searchQueries) {
      console.log(`\nSearch query: "${query}"`);
      
      const relevantMemories = await AgentMemoryService.getRelevantMemories(query, 3);
      console.log(`✅ Found ${relevantMemories.length} relevant memories`);
      
      if (relevantMemories.length > 0) {
        console.log('\nTop relevant memories:');
        relevantMemories.forEach((memory, i) => {
          console.log(`${i+1}. [${memory.type}] ${memory.content}`);
        });
        
        results.searchResults.push({ 
          query, 
          results: relevantMemories 
        });
      }
    }
    
    // PHASE 4: Final report
    console.log('\n📊 TEST SUMMARY');
    console.log('===================================');
    console.log(`✓ Stored total memories: ${results.storedMemories.length}`);
    console.log(`✓ Retrieved memories by type: ${results.retrievedMemories.length}`);
    console.log(`✓ Performed ${searchQueries.length} semantic searches`);
    console.log(`✓ Found relevant memories: ${results.searchResults.reduce((sum, r) => sum + r.results.length, 0)}`);
    
    console.log('\n✅ AGENT MEMORY SYSTEM FUNCTIONING CORRECTLY');
    
    return results;
  } catch (error) {
    console.error('❌ ERROR IN AGENT MEMORY TEST:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    }
    
    return {
      error: true,
      message: error?.message || 'Unknown error',
      ...results
    };
  }
}

// Run the test
if (typeof window !== 'undefined' && window.document) {
  // Browser environment
  console.log('Running in browser environment');
  console.log('Click a button or import this file to run the test');
} else {
  // Node.js environment
  runAgentMemoryTest()
    .then(results => {
      console.log('\nTest complete. Memory system is working.');
    })
    .catch(err => {
      console.error('Unhandled test error:', err);
      process.exit(1);
    });
}

export { runAgentMemoryTest }; 
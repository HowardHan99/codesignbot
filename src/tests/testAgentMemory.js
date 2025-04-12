// Test file for demonstrating the Agent Memory functionality
import { AgentMemoryService } from '../services/agentMemoryService';

/**
 * Function to test storing and retrieving agent memories
 */
async function testAgentMemory() {
  console.log('🧪 TESTING AGENT MEMORY FUNCTIONALITY');
  console.log('====================================');
  
  try {
    // 1. Store some test memories of different types
    console.log('\n1. Storing test memories...');
    
    // Store a conversation memory
    const conversationMemoryId = await AgentMemoryService.storeMemory(
      "User asked about the difference between wicked problems and regular problems in design thinking.",
      "conversation",
      {
        session: "test-session-123",
        timestamp: new Date().toISOString()
      }
    );
    console.log(`✓ Conversation memory stored with ID: ${conversationMemoryId}`);
    
    // Store a short-term memory
    const shortTermMemoryId = await AgentMemoryService.storeMemory(
      "The user seems interested in complex design challenges and problem-solving approaches.",
      "short_term",
      {
        confidence: 0.85,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    );
    console.log(`✓ Short-term memory stored with ID: ${shortTermMemoryId}`);
    
    // Store a long-term memory
    const longTermMemoryId = await AgentMemoryService.storeMemory(
      "This user frequently asks about systems thinking, wicked problems, and design methodologies. They seem to be working on complex social issues.",
      "long_term",
      {
        importance: "high",
        source: "interaction_pattern"
      }
    );
    console.log(`✓ Long-term memory stored with ID: ${longTermMemoryId}`);
    
    // Store a reflection memory
    const reflectionMemoryId = await AgentMemoryService.storeMemory(
      "I should provide more examples of wicked problems in social contexts since the user shows consistent interest in this area.",
      "reflection",
      {
        actionable: true,
        priority: "medium"
      }
    );
    console.log(`✓ Reflection memory stored with ID: ${reflectionMemoryId}`);
    
    // 2. Retrieve memories by type
    console.log('\n2. Retrieving memories by type...');
    
    const conversationMemories = await AgentMemoryService.getMemoriesByType("conversation", 5);
    console.log(`Retrieved ${conversationMemories.length} conversation memories`);
    
    const shortTermMemories = await AgentMemoryService.getMemoriesByType("short_term", 5);
    console.log(`Retrieved ${shortTermMemories.length} short-term memories`);
    
    // 3. Test semantic search for relevant memories
    console.log('\n3. Testing semantic search for relevant memories...');
    
    const query = "Tell me about wicked problems in design";
    console.log(`Query: "${query}"`);
    
    const relevantMemories = await AgentMemoryService.getRelevantMemories(query, 3);
    console.log(`Retrieved ${relevantMemories.length} relevant memories`);
    
    console.log('\nTop relevant memories:');
    relevantMemories.forEach((memory, index) => {
      console.log(`\n${index + 1}. [${memory.type}] ${memory.content}`);
      console.log(`   ID: ${memory.id}`);
      console.log(`   Metadata:`, memory.metadata);
    });
    
    return {
      success: true,
      storedIds: {
        conversation: conversationMemoryId,
        shortTerm: shortTermMemoryId,
        longTerm: longTermMemoryId,
        reflection: reflectionMemoryId
      },
      retrievedCounts: {
        byType: {
          conversation: conversationMemories.length,
          shortTerm: shortTermMemories.length
        },
        byRelevance: relevantMemories.length
      }
    };
  } catch (error) {
    console.error('❌ Error during agent memory test:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name
      });
    }
    return { success: false, error };
  }
}

// Run the test
testAgentMemory().then(result => {
  console.log('\n====================================');
  console.log('Test completed with result:', result.success ? 'SUCCESS' : 'FAILURE');
}).catch(err => {
  console.error('Unhandled test error:', err);
});

export { testAgentMemory }; 
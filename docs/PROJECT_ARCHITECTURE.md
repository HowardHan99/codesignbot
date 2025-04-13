# Project Architecture

## Overview

This project implements a voice recording and transcription system that integrates with Miro for collaborative design work. The system processes spoken design decisions and responses, evaluates their relevance to existing design decisions, and creates sticky notes in Miro frames to visualize the design thinking process. It also includes an Agent Memory system for persisting and retrieving contextual information using vector search capabilities.

## Directory Structure

```
src/
├── app/              # Next.js application entry points
├── components/       # React components
├── services/         # Business logic and API integration
│   ├── audio/        # Audio recording and processing services
│   ├── miro/         # Miro-specific services
│   └── ...           # Other services
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── tests/            # Test files
```

## Core Components

### User Interface Components

1. **VoiceRecorder**: Handles recording, processing, and sticky note creation for voice input
2. **FileUploadTest**: Processes uploaded audio files, similar to VoiceRecorder
3. **SendtoBoard**: Sends responses to Miro board as sticky notes
4. **AnalysisControls**: Provides UI for controlling analysis settings 
5. **AntagoInteract**: Manages interactions with the antagonistic analysis system
6. **DesignDecisions**: Displays and manages design decisions from Miro

### Services Layer

Services are organized in a hierarchical structure:

1. **High-level Services**:
   - `MiroService`: Facade for all Miro-related operations
   - `OpenAIService`: Handles AI model interactions
   - `VoiceRecordingService`: Manages voice recording state and processing
   - `AgentMemoryService`: Manages storage and retrieval of agent memories using vector search

2. **Mid-level Services**:
   - `StickyNoteService`: Creates and positions sticky notes 
   - `TranscriptProcessingService`: Processes transcripts into design points
   - `InclusiveDesignCritiqueService`: Analyzes designs for inclusivity issues
   - `RelevanceService`: Evaluates the relevance of content to design decisions
   - `KnowledgeService`: Manages storage and retrieval of knowledge documents

3. **Low-level Services/Clients**:
   - `MiroApiClient`: Direct client for Miro API calls
   - `AudioRecordingClient`: Handles browser audio recording
   - `ApiService`: Makes API calls to backend endpoints

## Data Flow

### Voice Recording Flow

1. User initiates recording via `VoiceRecorder` component
2. `VoiceRecordingService` uses `AudioRecordingClient` to capture audio
3. Audio chunks are processed in intervals:
   - Audio is sent to transcription service
   - Transcript is processed into design points
   - Relevance is evaluated against existing design decisions
   - Sticky notes are created in appropriate Miro frames

```
User → VoiceRecorder → VoiceRecordingService → AudioRecordingClient
     ↓
Transcription (API) → TranscriptProcessingService → ProcessedPoints
     ↓
RelevanceService (evaluates) ← InclusiveDesignCritiqueService (cached decisions)
     ↓
StickyNoteService → MiroApiClient → Miro Board
```

### File Upload Flow

1. User uploads audio file via `FileUploadTest` component
2. File is sent to transcription service
3. Transcript is chunked and processed
4. Each chunk is evaluated and transformed into sticky notes
5. Optional parent callback is invoked with processed points

```
User → FileUploadTest → ApiService (transcribe) → Chunked Transcript
     ↓
TranscriptProcessingService → Processed Points → RelevanceService
     ↓
StickyNoteService → MiroApiClient → Miro Board
```

### Agent Memory Flow

1. User interacts with the system, generating conversations or reflections
2. `AgentMemoryService` processes interactions and classifies into memory types
3. Memory is stored in Firestore with appropriate tags and embeddings
4. When context is needed, relevant memories are retrieved using vector search
5. Retrieved memories inform agent responses, creating continuity in interactions

```
User Interaction → AgentMemoryService → Memory Classification
     ↓
OpenAI Embeddings API → Vector Generation → Firestore Storage
     ↓
Query → Vector Search → Relevant Memories → Agent Context
```

## State Management

1. **Component-level State**:
   - React `useState` and `useEffect` for component UI state
   - `useRef` for mutable references that don't trigger re-renders

2. **Service-level State**:
   - Static private variables for service state
   - Cache mechanisms for frequently accessed data
   - Stateless services where possible for better testability

3. **Configuration**:
   - `ConfigurationService` provides centralized access to application settings
   - Runtime configuration overrides are supported

## Firebase Integration

The project integrates with Firebase for several critical functions:

1. **Firestore Database**:
   - Stores agent memories in the `agent_memory` collection
   - Stores knowledge documents in the `knowledge` collection
   - Leverages vector search capabilities for semantic retrieval

2. **Vector Search**:
   - Implements dual-approach vector search with Admin SDK and Client SDK
   - Provides fallback mechanisms for environments where vector search is unavailable
   - Uses custom indexes for efficient similarity search

3. **Authentication**:
   - Uses Firebase authentication for service access
   - Leverages Admin SDK for privileged operations

For detailed information on the vector search implementation, see [VECTOR_SEARCH.md](./VECTOR_SEARCH.md).

## Error Handling Strategy

The application implements a consistent error handling pattern:

1. **Service Layer**:
   - `safeApiCall` utility wraps all API calls with proper error handling
   - Failed operations return fallback values instead of throwing
   - Detailed error logging with operation context

2. **Component Layer**:
   - User-friendly error messages for UI display
   - Error states to control UI rendering
   - Recovery mechanisms where appropriate

## Asynchronous Operations

The codebase heavily uses async/await for asynchronous operations:

1. **API Calls**: All service methods that make API calls are async
2. **Rate Limiting**: Delays are added between API calls to avoid rate limits
3. **Cancellation**: Components implement cancellation mechanisms for long-running operations

## Performance Considerations

1. **Caching**:
   - Design decisions are cached to avoid repeated fetching
   - OpenAI API responses are cached with TTL
   - Embeddings are cached for faster similarity calculations
   - Memory retrievals use optimized query patterns to reduce database load

2. **Throttling and Debouncing**:
   - Voice processing is done in intervals rather than real-time
   - API calls are rate-limited to prevent overloading
   - UI updates are debounced for smoother user experience
   - Vector operations are optimized for performance

3. **Batching**:
   - Multiple sticky notes are created in batches where possible
   - Frame dimensions are adjusted once instead of per sticky note

## Testing Strategy

1. **Manual Testing Scripts**:
   - `testThemeGeneration.ts` for design theme generation testing
   - `runAgentMemoryTest.mjs` for testing agent memory functionality
   - `runKnowledgeTest.js` for testing knowledge retrieval
   - Browser console utilities for development testing

2. **Recommended Testing Approach**:
   - Test each component in isolation using mocked services
   - Test services with unit tests focusing on business logic
   - Integration tests for critical user flows
   - End-to-end tests for main scenarios

## Best Practices for Developers

### Code Style

1. Follow TypeScript best practices:
   - Use interfaces for data structures
   - Prefer explicit type annotations for function parameters
   - Use optional chaining and nullish coalescing where appropriate

2. Follow naming conventions:
   - PascalCase for components, interfaces, types, and classes
   - camelCase for variables, functions, and methods
   - Descriptive names that indicate purpose

### Component Development

1. Follow single responsibility principle:
   - Components should do one thing well
   - Extract reusable UI patterns into separate components
   - Keep component state minimal and focused

2. Props handling:
   - Define prop interfaces for all components
   - Use destructuring to access props
   - Provide default values for optional props

### Service Development

1. Follow service hierarchy:
   - Use appropriate service for the task
   - Add new methods to existing services where they fit
   - Create new services for distinct responsibilities

2. Error handling:
   - Always use `safeApiCall` for API operations
   - Provide meaningful fallback values
   - Log detailed error information

### Debugging

1. Use the extensive debug logging system:
   - Console logs are categorized by component/service
   - Log important state transitions and data processing steps
   - Include context in error logs

2. Chrome DevTools:
   - Use Network tab to monitor API calls
   - Use Performance tab to identify bottlenecks
   - Use Console for viewing debug logs

## Extending the Application

### Adding New Components

1. Create component file in `src/components/`
2. Define prop interface with clear comments
3. Use existing services rather than implementing new logic
4. Follow established patterns for error handling and state management

### Adding New Services

1. Determine if functionality fits in existing service
2. Create new service file in appropriate directory
3. Implement static class with clear method signatures
4. Use existing error handling patterns and logging

### Extending Agent Memory

1. Define memory structure with appropriate type and tags
2. Use `AgentMemoryService.storeMemory()` method for persistence
3. Retrieve memories using type-based or semantic search methods
4. Consider adding custom metadata for filtering capabilities

### Modifying Existing Features

1. Understand the current implementation thoroughly
2. Make minimal changes to achieve the goal
3. Update documentation to reflect changes
4. Test thoroughly across all affected components

## Deployment Considerations

1. Environment Variables:
   - MIRO_CLIENT_ID
   - MIRO_CLIENT_SECRET
   - MIRO_REDIRECT_URL
   - NEXT_PUBLIC_MIRO_OAUTH_TOKEN
   - NEXT_PUBLIC_MIRO_BOARD_ID
   - OPENAI_API_KEY
   - GOOGLE_APPLICATION_CREDENTIALS (for Firebase Admin SDK)
   - FIREBASE_PROJECT_ID

2. Browser Compatibility:
   - Application relies on modern browser APIs
   - Ensure MediaRecorder API is supported
   - Test across Chrome, Firefox, Safari, and Edge

3. Miro App Installation:
   - Install as a Miro app with appropriate permissions
   - Configure OAuth tokens and redirect URLs
   - Set up appropriate board access permissions

4. Firebase Configuration:
   - Deploy vector search indexes using `firebase deploy --only firestore:indexes`
   - Set up appropriate security rules for collections
   - Configure service account with appropriate permissions 
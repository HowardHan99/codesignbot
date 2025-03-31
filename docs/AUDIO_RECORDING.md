# Audio Recording and Transcription

## Overview

The audio recording and transcription system is a core feature of the application, allowing users to record their thoughts and have them automatically transcribed, processed, and visualized as sticky notes in Miro. This document explains the architecture, components, and workflow of this feature.

## Architecture

The audio recording system uses a layered approach:

1. **UI Layer**: `VoiceRecorder` component handles user interactions
2. **Service Layer**: `VoiceRecordingService` coordinates recording operations
3. **Client Layer**: `AudioRecordingClient` directly interacts with browser MediaRecorder API
4. **API Layer**: Backend transcription service processes audio into text
5. **Processing Layer**: `TranscriptProcessingService` transforms transcriptions into design points

## Components and Services

### VoiceRecorder Component

The `VoiceRecorder` component provides the UI for recording and handles:
- Starting and stopping recording
- Displaying recording status and timer
- Processing transcription chunks
- Creating sticky notes from processed transcriptions
- Managing error states and user feedback

```typescript
// Example usage of VoiceRecorder
<VoiceRecorder 
  mode="decision"
  onNewPoints={(points) => handleNewPoints(points)}
  enableRealTimeCritique={true}
/>
```

### VoiceRecordingService

This service coordinates the recording process and acts as a facade for the `AudioRecordingClient`. It manages:
- Recording state (active, processing, progress)
- Chunk processing intervals
- Error handling and retry mechanisms
- File naming and format detection

Key methods:
```typescript
// Start recording with optional chunk processing
static async startRecording(
  onTranscriptionChunk?: (transcription: string) => void,
  customInterval?: number
): Promise<boolean>

// Stop recording and get the final audio blob
static async stopRecording(): Promise<Blob | null>

// Get current recording status
static getStatus(): ProcessingStatus
```

### AudioRecordingClient

This client directly interacts with the browser's `MediaRecorder` API and handles:
- Audio stream acquisition and management
- Chunking of audio data
- MIME type detection and browser compatibility
- Processing intervals for progressive transcription

Key methods:
```typescript
// Start recording with options
static async startRecording(options: {
  chunkInterval?: number;
  onDataAvailable?: (chunk: Blob) => void;
}): Promise<MediaStream>

// Setup interval for processing chunks
static startProcessingInterval(
  processingFunction: (chunks: Blob[]) => Promise<void>,
  intervalMs: number
): void

// Stop recording and optionally close stream
static async stopRecording(closeStream: boolean = true): Promise<Blob | null>
```

### Transcription API

The application uses the OpenAI Whisper model for transcription via a Next.js API route (`/api/transcribe`). The workflow is:
1. Audio blob is sent to API endpoint
2. API validates audio format and size
3. Audio is processed by OpenAI Whisper model
4. Transcription text is returned to the client

```typescript
// Example API response
{
  transcription: "This is the transcribed text from the audio recording.",
  duration: 2.45 // seconds the processing took
}
```

### TranscriptProcessingService

This service processes raw transcriptions into structured design points:
1. Breaks transcripts into logical segments
2. Formats each segment for sticky notes
3. Extracts key design decisions or responses
4. Adds categorization and explanation where possible

```typescript
// Process a transcript into design points
static async processTranscript(transcript: string): Promise<ProcessedDesignPoint[]>
```

## Workflow

### Real-time Recording and Processing

1. **Recording Initialization**:
   ```
   User → VoiceRecorder.handleStartRecording()
        → VoiceRecordingService.startRecording()
        → AudioRecordingClient.startRecording()
        → Browser MediaRecorder API
   ```

2. **Chunk Processing Interval**:
   ```
   AudioRecordingClient.startProcessingInterval()
      ↓
   Every N milliseconds (default: 20s)
      ↓
   Process collected audio chunks
      ↓
   API.transcribeAudio()
      ↓
   onTranscriptionChunk callback
      ↓
   VoiceRecorder.handleTranscriptionChunk()
   ```

3. **Transcription Processing**:
   ```
   TranscriptProcessingService.processTranscript()
      ↓
   Fetch cached design decisions (InclusiveDesignCritiqueService)
      ↓
   Evaluate relevance (RelevanceService)
      ↓
   Create sticky notes (StickyNoteService)
   ```

4. **Recording Completion**:
   ```
   User → VoiceRecorder.handleStopRecording()
        → VoiceRecordingService.stopRecording()
        → AudioRecordingClient.stopRecording()
        → Final audio processing
   ```

### File Upload Processing

The `FileUploadTest` component provides an alternative entry point for processing pre-recorded audio files:

1. **File Selection**:
   ```
   User → FileUploadTest.handleFileChange()
        → processAudioFile()
   ```

2. **Transcription**:
   ```
   ApiService.transcribeAudio()
      ↓
   chunkTranscript() to split large transcripts
   ```

3. **Chunk Processing**:
   ```
   For each chunk:
      ↓
   TranscriptProcessingService.processTranscript()
      ↓
   evaluatePointsRelevance()
      ↓
   createStickyNotesForPoints()
   ```

## Advanced Features

### Progressive Processing

The system supports progressive processing of audio during recording:
- Audio is processed in chunks while recording continues
- Each chunk is transcribed and processed independently
- Sticky notes appear in near real-time during recording
- Progress and status updates are provided to the user

### Error Handling and Recovery

The system implements robust error handling:
- Browser compatibility checks for MediaRecorder API
- Microphone permission management and error feedback
- Transcription failures with appropriate user messages
- Network error recovery and retries
- Graceful degradation when features are unavailable

### Inclusive Design Critique

During voice recording, the system can analyze the content for inclusive design issues:
1. The transcript is analyzed by `InclusiveDesignCritiqueService`
2. AI evaluates the content against inclusive design principles
3. Critiques are visualized as sticky notes in the "Real-Time-Response" frame
4. Critiques are throttled to avoid overwhelming the user

## Configuration

Audio recording behavior can be configured in several ways:

1. **Recording Interval**: Controls how frequently chunks are processed
   ```typescript
   // Default is 20 seconds (20000ms)
   await VoiceRecordingService.startRecording(callback, 30000); // 30s interval
   ```

2. **Critique Interval**: Minimum time between inclusive design critiques
   ```typescript
   // In VoiceRecorder component
   const CRITIQUE_INTERVAL_MS = 30000; // 30 seconds
   ```

3. **Default formats**: The system works with various audio formats
   ```
   Supported formats: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm
   ```

## Browser Compatibility

The audio recording system requires:
- Modern browser with MediaRecorder API support
- Secure context (HTTPS) for microphone access
- User permission for microphone access

## Best Practices

### Implementation

1. **Always provide feedback** about recording status:
   - Visual indicators for recording state
   - Timer showing recording duration
   - Progress indicators during processing
   - Clear error messages when issues occur

2. **Handle permissions gracefully**:
   - Check for microphone permissions
   - Provide clear instructions when permissions are denied
   - Detect unsupported browsers and offer alternatives

3. **Optimize for performance**:
   - Use appropriate audio formats and compression
   - Process audio in chunks rather than waiting for completion
   - Consider mobile device constraints (memory, bandwidth)

### Extension

When extending the audio recording functionality:

1. **Adding new processing steps**:
   - Add new methods to `TranscriptProcessingService` 
   - Utilize existing chunking mechanisms
   - Follow the established patterns for error handling

2. **Customizing transcription**:
   - Modify the backend `/api/transcribe` endpoint
   - Consider language support and domain-specific vocabulary
   - Add pre/post-processing steps if needed

3. **Supporting new visualizations**:
   - Extend `StickyNoteService` with new visualization methods
   - Ensure compatibility with the Miro integration
   - Document any new frame structures or layouts

## Troubleshooting

Common issues and solutions:

1. **No audio recording**:
   - Check microphone permissions in browser
   - Ensure device has a working microphone
   - Verify secure context (HTTPS) for recording
   - Check browser console for MediaRecorder errors

2. **Transcription errors**:
   - Examine network requests to `/api/transcribe`
   - Verify OpenAI API key is valid
   - Check audio format compatibility
   - Look for rate limits or quota issues

3. **Poor transcription quality**:
   - Reduce background noise during recording
   - Speak clearly and at a moderate pace
   - Consider using a higher quality microphone
   - Try shorter recording segments 
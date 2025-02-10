import { SendtoBoard } from './SendtoBoard';

/**
 * Props interface for the AnalysisResults component
 */
interface AnalysisResultsProps {
  responses: string[];           // Array of analysis points to display
  isSimplifiedMode: boolean;     // Whether simplified mode is active
  selectedTone: string;          // Currently selected tone
  onCleanAnalysis: () => void;   // Handler for cleaning the analysis board
}

/**
 * Component for displaying analysis results and board interaction controls
 * Shows analysis points with their current mode and tone, and provides
 * controls for sending to board and cleaning the analysis
 */
export const AnalysisResults: React.FC<AnalysisResultsProps> = ({
  responses,
  isSimplifiedMode,
  selectedTone,
  onCleanAnalysis,
}) => {
  // Don't render anything if there are no responses
  if (!responses.length) return null;

  return (
    <>
      {/* Analysis Points Display */}
      <div className="response-pair" style={{ 
        marginBottom: '20px', 
        padding: '2px', 
        border: '1px solid #e6e6e6', 
        borderRadius: '8px',
        backgroundColor: '#ffffff'
      }}>
        <div>
          {/* Header showing current mode and tone */}
          <strong style={{ display: 'block', marginBottom: '12px' }}>
            Analysis Points {isSimplifiedMode ? '(Simplified)' : ''} {selectedTone ? `(${selectedTone} tone)` : ''}
          </strong>
          {/* List of analysis points */}
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {responses.map((point, pointIndex) => (
              <li key={pointIndex} style={{ marginBottom: '8px' }}>{point}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Board Control Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'left' }}>
        {/* Button to send responses to Miro board */}
        <SendtoBoard responses={responses} />
        {/* Button to clean existing analysis from board */}
        <button
          type="button"
          onClick={onCleanAnalysis}
          className="button button-secondary"
        >
          Clean Analysis Board
        </button>
      </div>
    </>
  );
}; 
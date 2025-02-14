import { SendtoBoard } from './SendtoBoard';

/**
 * Props interface for the AnalysisResults component
 */
interface AnalysisResultsProps {
  responses: string[];           // Array of analysis points to display
  isSimplifiedMode: boolean;     // Whether simplified mode is active
  selectedTone: string;          // Currently selected tone
  onCleanAnalysis: () => void;   // Handler for cleaning the analysis board
  isChangingTone?: boolean;      // Whether tone is currently being changed
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
  isChangingTone = false,
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
        backgroundColor: '#ffffff',
        position: 'relative',
        minHeight: '100px'
      }}>
        {isChangingTone && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
            borderRadius: '8px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid #f3f3f3',
              borderTop: '3px solid #4262ff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '10px'
            }} />
            <div style={{ color: '#666', fontSize: '14px' }}>
              Adjusting tone...
            </div>
            <style jsx>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}
        <div style={{ opacity: isChangingTone ? 0.3 : 1, transition: 'opacity 0.2s' }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'left', marginTop: '20px' }}>
        {/* Button to send responses to Miro board */}
        <SendtoBoard responses={responses} />
        {/* Button to clean existing analysis from board */}
        <button
          type="button"
          onClick={onCleanAnalysis}
          className="button button-secondary"
          disabled={isChangingTone}
        >
          Clean Analysis Board
        </button>
      </div>
    </>
  );
}; 
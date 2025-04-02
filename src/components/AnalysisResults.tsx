import { SendtoBoard } from './SendtoBoard';

/**
 * Interface for themed responses
 */
interface ThemedResponse {
  name: string;
  color: string;
  points: string[];
}

/**
 * Props interface for the AnalysisResults component
 */
interface AnalysisResultsProps {
  responses: string[];           // Array of analysis points to display
  isSimplifiedMode: boolean;     // Whether simplified mode is active
  selectedTone: string;          // Currently selected tone
  onCleanAnalysis: () => void;   // Handler for cleaning the analysis board
  isChangingTone?: boolean;      // Whether tone is currently being changed
  themedResponses?: ThemedResponse[];  // Responses organized by themes
  useThemedDisplay?: boolean;    // Whether to use the themed display
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
  themedResponses = [],
  useThemedDisplay = false,
}) => {
  // Don't render anything if there are no responses
  if (!responses.length && !themedResponses.length) return null;

  // Get the background color for a theme
  const getThemeColor = (colorName: string): string => {
    const colorMap: Record<string, string> = {
      'light_green': '#C3E5B5',
      'light_blue': '#BFE3F2',
      'light_yellow': '#F5F7B5',
      'light_pink': '#F5C3C2',
      'violet': '#D5C8E8',
      'light_gray': '#E5E5E5'
    };
    
    return colorMap[colorName] || '#E5E5E5';
  };

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
          
          {/* Themed display */}
          {useThemedDisplay && themedResponses.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {themedResponses.map((theme, themeIndex) => (
                <div key={themeIndex} style={{ 
                  borderLeft: `4px solid ${getThemeColor(theme.color)}`,
                  padding: '0 0 0 12px',
                  backgroundColor: `${getThemeColor(theme.color)}20`, // Add slight background with 12.5% opacity
                  borderRadius: '0 4px 4px 0',
                  paddingTop: '10px',
                  paddingBottom: '10px',
                  paddingRight: '10px'
                }}>
                  <h4 style={{ 
                    margin: '0 0 10px 0', 
                    color: '#333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>{theme.name}</span>
                    <span style={{ 
                      fontSize: '13px', 
                      fontWeight: 'normal',
                      color: '#666',
                      backgroundColor: '#ffffff80',
                      padding: '2px 6px',
                      borderRadius: '10px'
                    }}>
                      {theme.points.length} points
                    </span>
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {theme.points.map((point, pointIndex) => (
                      <li key={pointIndex} style={{ 
                        marginBottom: '8px',
                        backgroundColor: `${getThemeColor(theme.color)}10`, // Even lighter background
                        padding: '4px 8px',
                        borderRadius: '4px'
                      }}>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            /* Standard list of analysis points */
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {responses.map((point, pointIndex) => (
                <li key={pointIndex} style={{ marginBottom: '8px' }}>{point}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Board Control Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'left', marginTop: '20px' }}>
        {/* Button to send responses to Miro board */}
        <SendtoBoard 
          responses={responses} 
          themedResponses={themedResponses}
          useThemedDisplay={useThemedDisplay}
        />
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
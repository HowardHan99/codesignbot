import { SendtoBoard } from './SendtoBoard';

/**
 * Interface for themed responses
 */
interface ThemedResponse {
  name: string;
  color: string;
  points: string[];
  isSelected?: boolean; // Whether this theme is selected for point generation
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
  onThemeSelectToggle?: (themeIndex: number) => void; // Handler for toggling theme selection
  // New props for "Unpack Points" feature
  onSelectedPointsChange?: (selectedPoints: string[]) => void; // Callback for when point selection changes
  currentSelectedPoints?: string[]; // Currently selected points
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
  onThemeSelectToggle,
  // New props
  onSelectedPointsChange,
  currentSelectedPoints = [],
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

  // New: Handle selecting/deselecting a point
  const handlePointSelection = (point: string) => {
    if (!onSelectedPointsChange) return; // Skip if handler not provided
    
    const newSelectedPoints = [...currentSelectedPoints]; // Copy current selection
    
    if (newSelectedPoints.includes(point)) {
      // Deselect if already selected
      const index = newSelectedPoints.indexOf(point);
      newSelectedPoints.splice(index, 1);
    } else {
      // Add to selection if not already selected
      newSelectedPoints.push(point);
    }
    
    onSelectedPointsChange(newSelectedPoints);
  };

  // New: Check if a point is currently selected
  const isPointSelected = (point: string) => {
    return currentSelectedPoints.includes(point);
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
            {useThemedDisplay && themedResponses.length > 0 ? 
              'Themed Analysis Points' : 
              `Analysis Points ${isSimplifiedMode ? '(Simplified)' : ''} ${selectedTone ? `(${selectedTone} tone)` : ''}`
            }
          </strong>
          
          {/* Helper text for selection - New addition */}
          {onSelectedPointsChange && (
            <div style={{ 
              marginBottom: '15px', 
              fontSize: '13px', 
              color: '#666',
              backgroundColor: '#f5f5f5',
              padding: '8px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center'
            }}>
              <span style={{ marginRight: '6px' }}>👆</span>
              <span>Click on any point to select it for unpacking. Selected points will be highlighted. Click again to deselect.</span>
            </div>
          )}
          
          {/* Helper text explaining themed mode limitations */}
          {useThemedDisplay && themedResponses.length > 0 && (
            <div style={{ 
              marginBottom: '15px', 
              fontSize: '13px', 
              color: '#666',
              backgroundColor: '#f5f5f5',
              padding: '8px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center'
            }}>
              <span style={{ marginRight: '6px' }}>💡</span>
              <span>Currently showing themed points. Each theme contains specific criticisms related to that theme's focus. You can adjust tone and simplify points using the controls above.</span>
            </div>
          )}
          
          {/* Themed display */}
          {useThemedDisplay && themedResponses.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {themedResponses.map((theme, themeIndex) => {
                // Determine if theme is selected (default to true if not specified)
                const isSelected = theme.isSelected !== false;
                
                // Apply grayscale filter if theme is not selected
                const themeColor = isSelected ? getThemeColor(theme.color) : '#E5E5E5';
                const filter = isSelected ? 'none' : 'grayscale(100%)';
                
                return (
                  <div key={themeIndex} style={{ 
                    borderLeft: `4px solid ${themeColor}`,
                    padding: '0 0 0 12px',
                    backgroundColor: `${themeColor}20`, // Add slight background with 12.5% opacity
                    borderRadius: '0 4px 4px 0',
                    paddingTop: '10px',
                    paddingBottom: '10px',
                    paddingRight: '10px',
                    filter,
                    opacity: isSelected ? 1 : 0.6,
                    transition: 'filter 0.3s, opacity 0.3s'
                  }}>
                    <h4 
                      onClick={() => onThemeSelectToggle?.(themeIndex)}
                      style={{ 
                        margin: '0 0 10px 0', 
                        color: '#333',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: onThemeSelectToggle ? 'pointer' : 'default',
                        position: 'relative'
                      }}
                      title={onThemeSelectToggle ? `Click to ${isSelected ? 'deselect' : 'select'} this theme for point generation` : ''}
                    >
                      <span>
                        {theme.name}
                        {!isSelected && (
                          <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '12px', 
                            color: '#888',
                            fontWeight: 'normal'
                          }}>
                            (deselected for point generation)
                          </span>
                        )}
                      </span>
                      {onThemeSelectToggle && (
                        <span style={{ 
                          display: 'inline-block', 
                          width: '18px', 
                          height: '18px', 
                          borderRadius: '50%', 
                          border: '2px solid #ddd',
                          position: 'relative'
                        }}>
                          {isSelected && (
                            <span style={{ 
                              position: 'absolute', 
                              top: '3px', 
                              left: '3px', 
                              width: '12px', 
                              height: '12px',
                              backgroundColor: themeColor,
                              borderRadius: '50%'
                            }} />
                          )}
                        </span>
                      )}
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {theme.points.map((point, pointIndex) => (
                        <li 
                          key={`${themeIndex}-${pointIndex}`} 
                          style={{ 
                            marginBottom: '8px',
                            cursor: onSelectedPointsChange ? 'pointer' : 'default',
                            backgroundColor: isPointSelected(point) ? 'rgba(0, 100, 255, 0.1)' : 'transparent',
                            padding: '3px',
                            borderRadius: '4px',
                            transition: 'background-color 0.2s'
                          }}
                          onClick={() => handlePointSelection(point)}
                          title={onSelectedPointsChange ? `Click to ${isPointSelected(point) ? 'deselect' : 'select'} for unpacking` : ''}
                        >
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Standard list of analysis points */
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {responses.map((point, pointIndex) => (
                <li 
                  key={pointIndex} 
                  style={{ 
                    marginBottom: '8px',
                    cursor: onSelectedPointsChange ? 'pointer' : 'default',
                    backgroundColor: isPointSelected(point) ? 'rgba(0, 100, 255, 0.1)' : 'transparent',
                    padding: '3px',
                    borderRadius: '4px',
                    transition: 'background-color 0.2s'
                  }}
                  onClick={() => handlePointSelection(point)}
                  title={onSelectedPointsChange ? `Click to ${isPointSelected(point) ? 'deselect' : 'select'} for unpacking` : ''}
                >
                  {point}
                </li>
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
        {/* Clean Analysis button */}
        <button
          type="button"
          onClick={onCleanAnalysis}
          className="button button-secondary"
          style={{ backgroundColor: '#f0f0f0', borderColor: '#cccccc', color: '#333333' }}
          disabled={isChangingTone}
        >
          Clean Analysis Board
        </button>
      </div>
    </>
  );
}; 
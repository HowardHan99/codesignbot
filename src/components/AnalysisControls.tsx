/**
 * Props interface for the AnalysisControls component
 */
interface AnalysisControlsProps {
  selectedTone: string;              // Currently selected tone for the analysis
  isSimplifiedMode: boolean;         // Whether simplified mode is active
  synthesizedPointsCount: number;    // Number of synthesized points available
  useThemedDisplay?: boolean;        // Whether to use themed display (optional for backward compatibility)
  onToneChange: (tone: string) => void;          // Handler for tone changes
  onModeToggle: () => void;                      // Handler for mode toggle
  onShowSynthesizedPoints: () => void;           // Handler for showing synthesized points
  onDisplayToggle?: () => void;                  // Handler for display mode toggle (optional for backward compatibility)
}

/**
 * Component for controlling analysis settings and displaying synthesized points
 * Provides UI controls for tone selection, mode toggle, and synthesized points display
 */
export const AnalysisControls: React.FC<AnalysisControlsProps> = ({
  selectedTone,
  isSimplifiedMode,
  synthesizedPointsCount,
  useThemedDisplay = false,
  onToneChange,
  onModeToggle,
  onShowSynthesizedPoints,
  onDisplayToggle = () => {},
}) => {
  return (
    <div style={{ 
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      marginBottom: '20px',
      padding: '12px',
      backgroundColor: '#f5f5f7',
      borderRadius: '8px'
    }}>
      {/* Synthesized Points Button */}
      <button
        type="button"
        onClick={onShowSynthesizedPoints}
        className="button button-primary"
        disabled={!synthesizedPointsCount}
        style={{ 
          alignSelf: 'flex-start', 
          width: '100%',
          backgroundColor: '#4262ff',
          color: '#ffffff',
          fontWeight: '500'
        }}
      >
        Show All Suggested Points ({synthesizedPointsCount})
      </button>

      {/* Display Mode Toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        backgroundColor: useThemedDisplay ? '#e6f7ff' : '#f9f9f9',
        borderRadius: '4px',
        border: '1px solid #e0e0e0'
      }}>
        <div style={{ fontSize: '14px', fontWeight: '500' }}>
          Display Mode
        </div>
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <label className="toggle" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
            <span style={{ 
              marginRight: '6px', 
              fontSize: '14px', 
              color: useThemedDisplay ? '#999' : '#333',
              transition: 'color 0.2s'
            }}>
              Standard
            </span>
            <input 
              type="checkbox" 
              tabIndex={0}
              checked={useThemedDisplay}
              onChange={onDisplayToggle}
              style={{ position: 'relative', margin: '0 8px' }}
            />
            <span style={{ 
              marginLeft: '0px', 
              fontSize: '14px', 
              color: useThemedDisplay ? '#333' : '#999',
              transition: 'color 0.2s'
            }}>
              Themed
            </span>
          </label>
        </div>
      </div>

      {/* Controls Container */}
      <div style={{ 
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
      }}>
        {/* Tone Selection */}
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minWidth: '100px'
        }}>
          <label style={{ fontSize: '14px', fontWeight: '500', whiteSpace: 'nowrap' }}>Tone:</label>
          <select 
            value={selectedTone}
            onChange={(e) => onToneChange(e.target.value)}
            className="select"
            style={{ flex: 1 }}
          >
            <option value="">Normal</option>
            <option value="persuasive">Persuasive</option>
            <option value="aggressive">Aggressive</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {/* Mode Toggle */}
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '2px'
        }}>
          <label style={{ fontSize: '14px', fontWeight: '500', whiteSpace: 'nowrap' }}>Message:</label>
          <label className="toggle" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
            <input 
              type="checkbox" 
              tabIndex={0}
              checked={isSimplifiedMode}
              onChange={onModeToggle}
              disabled={useThemedDisplay}
            />
            <span style={{ 
              marginLeft: '0px', 
              fontSize: '14px', 
              whiteSpace: 'nowrap',
              opacity: useThemedDisplay ? 0.5 : 1
            }}>
              {isSimplifiedMode ? 'Simple' : 'Full'}
            </span>
          </label>
        </div>
      </div>

      {/* Simplified Mode Note */}
      {isSimplifiedMode && !useThemedDisplay && (
        <div style={{ 
          fontSize: '13px', 
          color: '#666',
          fontStyle: 'italic',
          borderTop: '1px solid rgba(0,0,0,0.1)',
          marginTop: '4px',
          paddingTop: '12px'
        }}>
          💡 Currently showing simplified points. Toggle the Message switch above to see the full points.
        </div>
      )}

      {/* Themed Display Note */}
      {useThemedDisplay && (
        <div style={{ 
          fontSize: '13px', 
          color: '#666',
          fontStyle: 'italic',
          borderTop: '1px solid rgba(0,0,0,0.1)',
          marginTop: '4px',
          paddingTop: '12px'
        }}>
          💡 Currently showing themed points. Each theme contains 5 specific criticisms related to that theme's focus.
        </div>
      )}
    </div>
  );
}; 
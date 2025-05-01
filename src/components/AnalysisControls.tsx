/**
 * Props interface for the AnalysisControls component
 */
interface VariationsToSend {
  rag: boolean;
  principles: boolean;
  prompt: boolean;
}

interface AnalysisControlsProps {
  selectedTone: string;              // Currently selected tone for the analysis
  isSimplifiedMode: boolean;         // Whether simplified mode is active
  synthesizedPointsCount: number;    // Number of synthesized points available
  useThemedDisplay?: boolean;        // Whether to use themed display (optional for backward compatibility)
  useThinkingDialogue?: boolean;     // Whether to include thinking dialogue context
  hasThinkingResults?: boolean;      // Whether thinking dialogue results are available
  onToneChange: (tone: string) => void;          // Handler for tone changes
  onModeToggle: () => void;                      // Handler for mode toggle
  onShowSynthesizedPoints: () => void;           // Handler for showing synthesized points
  onDisplayToggle?: () => void;                  // Handler for display mode toggle (optional for backward compatibility)
  onThinkingDialogueToggle?: () => void;         // Handler for thinking dialogue toggle
  // New props for variations
  hasRagContent: boolean;
  hasPrinciples: boolean;
  hasPrompt: boolean;
  variationsToSend: VariationsToSend;
  onVariationSelectionChange: (variation: keyof VariationsToSend, selected: boolean) => void;
  onSendVariations: () => void;
}

/**
 * Component for controlling analysis settings and displaying synthesized points
 * Provides UI controls for tone selection, mode toggle, and synthesized points display
 */
export const AnalysisControls: React.FC<AnalysisControlsProps> = ({
  selectedTone,
  isSimplifiedMode,
  synthesizedPointsCount,
  useThemedDisplay = true,
  useThinkingDialogue = false,
  hasThinkingResults = false,
  onToneChange,
  onModeToggle,
  onShowSynthesizedPoints,
  onDisplayToggle = () => {},
  onThinkingDialogueToggle = () => {},
  // New props for variations
  hasRagContent,
  hasPrinciples,
  hasPrompt,
  variationsToSend,
  onVariationSelectionChange,
  onSendVariations
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

      {/* Thinking Dialogue Toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        backgroundColor: useThinkingDialogue ? '#e6fff0' : '#f9f9f9',
        borderRadius: '4px',
        border: '1px solid #e0e0e0'
      }}>
        <div style={{ fontSize: '14px', fontWeight: '500' }}>
          Thinking Dialogue
        </div>
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <label className="toggle" style={{ display: 'flex', alignItems: 'center', cursor: hasThinkingResults ? 'pointer' : 'not-allowed', margin: 0 }}>
            <span style={{ 
              marginRight: '6px', 
              fontSize: '14px', 
              color: useThinkingDialogue ? '#999' : '#333',
              transition: 'color 0.2s'
            }}>
              Off
            </span>
            <input 
              type="checkbox" 
              tabIndex={0}
              checked={useThinkingDialogue}
              onChange={onThinkingDialogueToggle}
              disabled={!hasThinkingResults}
              style={{ position: 'relative', margin: '0 8px' }}
            />
            <span style={{ 
              marginLeft: '0px', 
              fontSize: '14px', 
              color: useThinkingDialogue ? '#333' : '#999',
              transition: 'color 0.2s'
            }}>
              On
            </span>
          </label>
        </div>
      </div>

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
          gap: '2px'
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
        position: 'relative'
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
            style={{ 
              flex: 1,
              opacity: 1 // Always fully visible
            }}
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
          <label className="toggle" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            cursor: 'pointer', 
            margin: 0 
          }}>
            <input 
              type="checkbox" 
              tabIndex={0}
              checked={isSimplifiedMode}
              onChange={onModeToggle}
            />
            <span style={{ 
              marginLeft: '0px', 
              fontSize: '14px', 
              whiteSpace: 'nowrap',
              opacity: 1 // Always fully visible
            }}>
              {isSimplifiedMode ? 'Simple' : 'Full'}
            </span>
          </label>
        </div>
      </div>

      {/* Simplified Mode Note */}
      {isSimplifiedMode && (
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
          💡 Currently showing themed points. Each theme contains points related to that theme's focus.
        </div>
      )}

      {/* New section for variations */}
      <div style={{ marginTop: '10px', borderTop: '1px solid #ddd', paddingTop: '10px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Send Variations to Board:</div>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            opacity: hasRagContent ? 1 : 0.5, 
            cursor: hasRagContent ? 'pointer' : 'not-allowed',
            backgroundColor: hasRagContent ? (variationsToSend.rag ? '#e6f7ff' : 'transparent') : '#f5f5f5',
            padding: '5px 10px',
            borderRadius: '4px',
            border: `1px solid ${hasRagContent ? (variationsToSend.rag ? '#4a86e8' : '#e0e0e0') : '#e0e0e0'}`,
            transition: 'all 0.2s ease'
          }}>
            <input 
              type="checkbox" 
              checked={variationsToSend.rag} 
              onChange={(e) => onVariationSelectionChange('rag', e.target.checked)}
              disabled={!hasRagContent}
              style={{ marginRight: '5px' }}
            />
            RAG Content
          </label>
          
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            opacity: hasPrinciples ? 1 : 0.5, 
            cursor: hasPrinciples ? 'pointer' : 'not-allowed',
            backgroundColor: hasPrinciples ? (variationsToSend.principles ? '#e6f7ff' : 'transparent') : '#f5f5f5',
            padding: '5px 10px',
            borderRadius: '4px',
            border: `1px solid ${hasPrinciples ? (variationsToSend.principles ? '#4a86e8' : '#e0e0e0') : '#e0e0e0'}`,
            transition: 'all 0.2s ease'
          }}>
            <input 
              type="checkbox" 
              checked={variationsToSend.principles} 
              onChange={(e) => onVariationSelectionChange('principles', e.target.checked)}
              disabled={!hasPrinciples}
              style={{ marginRight: '5px' }}
            />
            Design Principles
          </label>
          
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            opacity: hasPrompt ? 1 : 0.5, 
            cursor: hasPrompt ? 'pointer' : 'not-allowed',
            backgroundColor: hasPrompt ? (variationsToSend.prompt ? '#e6f7ff' : 'transparent') : '#f5f5f5',
            padding: '5px 10px',
            borderRadius: '4px',
            border: `1px solid ${hasPrompt ? (variationsToSend.prompt ? '#4a86e8' : '#e0e0e0') : '#e0e0e0'}`,
            transition: 'all 0.2s ease'
          }}>
            <input 
              type="checkbox" 
              checked={variationsToSend.prompt} 
              onChange={(e) => onVariationSelectionChange('prompt', e.target.checked)}
              disabled={!hasPrompt}
              style={{ marginRight: '5px' }}
            />
            Agent Prompt
          </label>
        </div>
        
        <button 
          onClick={onSendVariations}
          disabled={!(variationsToSend.rag || variationsToSend.principles || variationsToSend.prompt)}
          style={{
            backgroundColor: (variationsToSend.rag || variationsToSend.principles || variationsToSend.prompt) ? '#4a86e8' : '#ccc',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '3px',
            cursor: (variationsToSend.rag || variationsToSend.principles || variationsToSend.prompt) ? 'pointer' : 'not-allowed'
          }}
        >
          Place Selected on Board
        </button>
      </div>
    </div>
  );
}; 
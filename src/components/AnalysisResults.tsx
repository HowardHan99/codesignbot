import { SendtoBoard } from './SendtoBoard';

interface AnalysisResultsProps {
  responses: string[];
  isSimplifiedMode: boolean;
  selectedTone: string;
  onCleanAnalysis: () => void;
}

export const AnalysisResults: React.FC<AnalysisResultsProps> = ({
  responses,
  isSimplifiedMode,
  selectedTone,
  onCleanAnalysis,
}) => {
  if (!responses.length) return null;

  return (
    <>
      <div className="response-pair" style={{ 
        marginBottom: '20px', 
        padding: '2px', 
        border: '1px solid #e6e6e6', 
        borderRadius: '8px',
        backgroundColor: '#ffffff'
      }}>
        <div>
          <strong style={{ display: 'block', marginBottom: '12px' }}>
            Analysis Points {isSimplifiedMode ? '(Simplified)' : ''} {selectedTone ? `(${selectedTone} tone)` : ''}
          </strong>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {responses.map((point, pointIndex) => (
              <li key={pointIndex} style={{ marginBottom: '8px' }}>{point}</li>
            ))}
          </ul>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'left' }}>
        <SendtoBoard responses={responses} />
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
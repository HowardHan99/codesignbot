import React, { useState, useEffect } from 'react';
import { DocumentService } from '../services/miro/documentService';
import BoardTokenManager from '../utils/boardTokenManager';
import { 
  testHtmlDocument, 
  testThinkingDocument, 
  testCustomHtmlDocument 
} from '../tests/documentService.test';

/**
 * A button component for testing document creation functionality
 */
const TestDocumentButton: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [boardId, setBoardId] = useState<string | null>(null);

  // Check if we have a token for the current board
  useEffect(() => {
    const checkToken = async () => {
      try {
        const boardInfo = await miro.board.getInfo();
        setBoardId(boardInfo.id);
        const token = await BoardTokenManager.getToken(boardInfo.id);
        setHasToken(!!token);
      } catch (err) {
        console.error('Error checking token:', err);
        setHasToken(false);
      }
    };

    checkToken();
  }, []);

  const runTest = async (testName: string, testFn: () => Promise<void>) => {
    setIsLoading(true);
    setResult(null);
    setError(null);
    
    try {
      console.log(`Running test: ${testName}`);
      await testFn();
      setResult(`Test "${testName}" completed successfully!`);
    } catch (err) {
      console.error(`Test "${testName}" failed:`, err);
      setError(`${testName} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthenticate = () => {
    if (!boardId) return;
    
    // Create auth URL with client ID and redirect
    const authUrl = `https://miro.com/oauth/authorize?response_type=token&client_id=${process.env.NEXT_PUBLIC_MIRO_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin)}&board_id=${boardId}`;
    
    // Open auth window
    window.open(authUrl, '_blank', 'width=800,height=800');
  };

  return (
    <div className="flex flex-col space-y-4 p-4 border rounded-lg bg-white shadow-sm">
      <h2 className="text-lg font-semibold">Document Test Tools</h2>
      
      {!hasToken && (
        <button 
          onClick={handleAuthenticate} 
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
        >
          Authenticate with Miro
        </button>
      )}
      
      <div className="flex flex-col space-y-2">
        <button
          onClick={() => runTest('Simple HTML Document', testHtmlDocument)}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Test Simple HTML Document
        </button>
        
        <button
          onClick={() => runTest('Thinking Process Document', testThinkingDocument)}
          disabled={isLoading}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          Test Thinking Process Document
        </button>
        
        <button
          onClick={() => runTest('Custom HTML Document', testCustomHtmlDocument)}
          disabled={isLoading}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
        >
          Test Custom HTML Document
        </button>
      </div>
      
      {isLoading && (
        <div className="text-gray-500">
          Running test... Please check the Miro board.
        </div>
      )}
      
      {result && (
        <div className="p-3 bg-green-100 text-green-800 rounded">
          {result}
        </div>
      )}
      
      {error && (
        <div className="p-3 bg-red-100 text-red-800 rounded">
          {error}
        </div>
      )}
    </div>
  );
};

export default TestDocumentButton; 
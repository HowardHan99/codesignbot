import React, { useState, useRef, useEffect } from 'react';
import { OpenAIService } from '../services/openaiService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ConversationPanelProps {
  designChallenge: string;
  currentCriticism: string[];
  onInstructionReceived?: (instruction: string) => void;
}

export const ConversationPanel: React.FC<ConversationPanelProps> = ({
  designChallenge,
  currentCriticism,
  onInstructionReceived
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    // Check for special commands
    if (inputMessage.toLowerCase() === 'noted') {
      setMessages(prev => [...prev, { role: 'user', content: inputMessage, timestamp: new Date() }]);
      setInputMessage('');
      return;
    }

    if (inputMessage.toLowerCase().startsWith('instruct:')) {
      const instruction = inputMessage.slice(9).trim();
      onInstructionReceived?.(instruction);
      setMessages(prev => [...prev, { role: 'user', content: inputMessage, timestamp: new Date() }]);
      setInputMessage('');
      return;
    }

    try {
      setIsLoading(true);
      setMessages(prev => [...prev, { role: 'user', content: inputMessage, timestamp: new Date() }]);

      const conversationContext = messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      const response = await OpenAIService.generateConversationResponse(
        inputMessage,
        designChallenge,
        currentCriticism,
        conversationContext
      );

      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date() }]);
      setInputMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: 'Sorry, I encountered an error processing your message. Please try again.',
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="conversation-panel">
      <div className="panel-header">
        <h3>Design Discussion</h3>
        <button 
          onClick={() => setIsMinimized(!isMinimized)} 
          className="control-button"
        >
          {isMinimized ? '□' : '−'}
        </button>
      </div>
      
      {!isMinimized && (
        <>
          <div className="messages-container">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`message ${message.role}`}
              >
                <div className="message-content">
                  {message.content}
                </div>
                <div className="message-timestamp">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-container">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask me about the analysis or your design decisions..."
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              className="button button-primary"
              disabled={isLoading}
            >
              {isLoading ? '...' : 'Send'}
            </button>
          </div>
        </>
      )}

      <style jsx>{`
        .conversation-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(5px);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: rgba(66, 98, 255, 0.1);
          user-select: none;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }

        .panel-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .control-button {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          padding: 0 4px;
          color: #666;
          transition: color 0.2s;
        }

        .control-button:hover {
          color: #1a1a1a;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: rgba(255, 255, 255, 0.7);
        }

        .message {
          display: flex;
          flex-direction: column;
          max-width: 80%;
          opacity: 0;
          animation: fadeIn 0.3s ease forwards;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .message.user {
          align-self: flex-end;
        }

        .message.assistant {
          align-self: flex-start;
        }

        .message-content {
          padding: 8px 12px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .message.user .message-content {
          background-color: rgba(66, 98, 255, 0.9);
          color: white;
        }

        .message.assistant .message-content {
          background-color: rgba(245, 245, 247, 0.9);
          color: #050038;
        }

        .message-timestamp {
          font-size: 11px;
          color: #666;
          margin-top: 4px;
        }

        .input-container {
          display: flex;
          gap: 8px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.9);
          border-top: 1px solid rgba(0, 0, 0, 0.1);
        }

        .input-container input {
          flex: 1;
          padding: 8px 12px;
          border-radius: 4px;
          border: 1px solid rgba(195, 194, 207, 0.8);
          font-size: 14px;
          background: rgba(255, 255, 255, 0.9);
          transition: border-color 0.2s;
        }

        .input-container input:focus {
          outline: none;
          border-color: rgba(66, 98, 255, 0.8);
          box-shadow: 0 0 0 2px rgba(66, 98, 255, 0.2);
        }

        .input-container button {
          min-width: 80px;
        }
      `}</style>
    </div>
  );
}; 
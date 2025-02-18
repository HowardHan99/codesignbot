import React, { useState, useRef, useEffect } from 'react';
import { OpenAIService } from '../services/openaiService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface MiroConversationModalProps {
  designChallenge: string;
  currentCriticism: string[];
  onClose?: () => void;
}

export const MiroConversationModal: React.FC<MiroConversationModalProps> = ({
  designChallenge,
  currentCriticism,
  onClose
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize with welcome message
  useEffect(() => {
    const welcomeMessage = {
      role: 'assistant' as const,
      content: `Welcome to the Design Discussion! I've analyzed your design decisions and provided critical feedback. This is your space to:

1. Respond to the criticism points
2. Explain your design rationale
3. Ask for clarification on any points
4. Share additional context

Your responses will help me better understand your design thinking and provide more nuanced feedback. If you close this dialog without responding, I'll interpret that as choosing not to address these points.

Here are the current criticism points to discuss:

${currentCriticism.map((point, index) => `${index + 1}. ${point}`).join('\n')}

How would you like to address these points?`,
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
  }, [currentCriticism]);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

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
    <div className="modal-container">
      <div className="modal-header">
        <h3>Design Discussion</h3>
        {onClose && (
          <button onClick={onClose} className="close-button">×</button>
        )}
      </div>

      <div className="messages-container">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`message ${message.role}`}
          >
            <div className="message-content">
              {message.content.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
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
          placeholder="Type your response here..."
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

      <style jsx>{`
        .modal-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: white;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: #f5f5f7;
          border-bottom: 1px solid #e6e6e6;
        }

        .modal-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          padding: 0 8px;
        }

        .close-button:hover {
          color: #ff4444;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .message {
          display: flex;
          flex-direction: column;
          max-width: 85%;
        }

        .message.user {
          align-self: flex-end;
        }

        .message.assistant {
          align-self: flex-start;
        }

        .message-content {
          padding: 12px 16px;
          border-radius: 8px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        .message-content p {
          margin: 0;
          padding: 4px 0;
        }

        .message.user .message-content {
          background-color: #4262ff;
          color: white;
        }

        .message.assistant .message-content {
          background-color: #f5f5f7;
          color: #1a1a1a;
        }

        .message-timestamp {
          font-size: 11px;
          color: #666;
          margin-top: 4px;
          padding: 0 4px;
        }

        .input-container {
          display: flex;
          gap: 8px;
          padding: 16px;
          background: white;
          border-top: 1px solid #e6e6e6;
        }

        .input-container input {
          flex: 1;
          padding: 8px 12px;
          border-radius: 4px;
          border: 1px solid #e6e6e6;
          font-size: 14px;
        }

        .input-container input:focus {
          outline: none;
          border-color: #4262ff;
          box-shadow: 0 0 0 2px rgba(66, 98, 255, 0.2);
        }

        .input-container button {
          min-width: 80px;
        }
      `}</style>
    </div>
  );
}; 
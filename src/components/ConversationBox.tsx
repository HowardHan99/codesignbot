import React, { useState, useRef, useEffect } from 'react';
import { OpenAIService } from '../services/openaiService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ConversationBoxProps {
  designChallenge: string;
  currentCriticism: string[];
  onInstructionReceived?: (instruction: string) => void;
}

export const ConversationBox: React.FC<ConversationBoxProps> = ({
  designChallenge,
  currentCriticism,
  onInstructionReceived
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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

      // Prepare context from previous messages
      const conversationContext = messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      // Get response from OpenAI
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
    <div className="conversation-box" style={{ marginTop: '20px' }}>
      {messages.length > 0 && (
        <div 
          className="messages-container" 
          style={{ 
            height: '300px', 
            overflowY: 'auto',
            border: '1px solid #e6e6e6',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            backgroundColor: '#ffffff'
          }}
        >
          {messages.map((message, index) => (
            <div
              key={index}
              style={{
                marginBottom: '12px',
                textAlign: message.role === 'user' ? 'right' : 'left'
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: message.role === 'user' ? '#4262ff' : '#f5f5f7',
                  color: message.role === 'user' ? '#ffffff' : '#050038'
                }}
              >
                {message.content}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#666',
                  marginTop: '4px'
                }}
              >
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder={messages.length === 0 ? "Start a conversation about your design decisions..." : "Type your message here..."}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #c3c2cf',
            fontSize: '14px'
          }}
          disabled={isLoading}
        />
        <button
          onClick={handleSendMessage}
          className="button button-primary"
          disabled={isLoading}
          style={{ minWidth: '80px' }}
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}; 
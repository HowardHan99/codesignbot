import React, { useState, useRef, useEffect } from 'react';
import { OpenAIService } from '../services/openaiService';
import { MiroService } from '../services/miroService';

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
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);

  // Initialize with welcome message and listen to BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel('miro-conversation');
    const messageHandler = (event: MessageEvent) => {
      if (event.data && event.data.type === 'INIT_MODAL') {
        const { designChallenge: dc, currentCriticism: cc, sessionId: sid } = event.data;
        // Initialize with welcome message using received data
        const welcomeMessage = {
          role: 'assistant' as const,
          content: `Here are the criticism points for your design:

${(cc || []).map((point: string, index: number) => `${index + 1}. ${point}`).join('\n')}

You can:
- Accept all points if you agree with the feedback
- Ignore all points if you disagree
- Or start a detailed discussion about specific points
`,
          timestamp: new Date()
        };
        setMessages([welcomeMessage]);
        if (sid) {
          setCurrentSessionId(sid);
        }
      }
    };

    channel.addEventListener('message', messageHandler);

    // Cleanup
    return () => {
      channel.removeEventListener('message', messageHandler);
      channel.close();
    };
  }, []); // Empty dependency array: run once on mount

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
      const userMessage: Message = { role: 'user', content: inputMessage, timestamp: new Date() };
      setMessages(prev => [...prev, userMessage]);
      setInputMessage('');
      
      if (isWaitingForResponse) {
        // Format the consensus point based on the context
        let consensusPoint = '';
        const lastAssistantMessage = messages[messages.length - 1]?.content || '';
        
        if (lastAssistantMessage.includes('why you accept')) {
          // Format acceptance consensus
          consensusPoint = `DESIGN DECISION ACCEPTANCE: Designers accepted the following points:\n${
            currentCriticism.map((point, i) => `${i + 1}. ${point}`).join('\n')
          }\nReasoning: ${inputMessage}`;
        } else if (lastAssistantMessage.includes('why you disagree')) {
          // Format rejection consensus
          consensusPoint = `DESIGN DECISION REJECTION: Designers rejected the following points:\n${
            currentCriticism.map((point, i) => `${i + 1}. ${point}`).join('\n')
          }\nReasoning: ${inputMessage}`;
        } else {
          // Format general instruction consensus
          consensusPoint = `DESIGN INSTRUCTION: For criticism points:\n${
            currentCriticism.map((point, i) => `${i + 1}. ${point}`).join('\n')
          }\nDesigners' instruction: ${inputMessage}`;
        }
        
        try {
          // Add to consensus frame
          await MiroService.addConsensusPoints([consensusPoint], currentSessionId);
          
          const conversationContext = messages
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');

          const response = await OpenAIService.generateConversationResponse(
            inputMessage,
            designChallenge,
            currentCriticism,
            conversationContext
          );

          const assistantMessage: Message = { 
            role: 'assistant', 
            content: 'I\'ve recorded your feedback in the consensus. ' + response,
            timestamp: new Date() 
          };
          setMessages(prev => [...prev, assistantMessage]);
          
          // Close modal after a delay if this was an accept/reject explanation
          if (lastAssistantMessage.includes('why you accept') || lastAssistantMessage.includes('why you disagree')) {
            setTimeout(() => onClose?.(), 2000);
          }
        } catch (error) {
          console.error('Error processing consensus:', error);
          const errorMessage: Message = { 
            role: 'assistant', 
            content: 'I\'ve received your feedback, but there was an error saving it. Would you like to try again?',
            timestamp: new Date() 
          };
          setMessages(prev => [...prev, errorMessage]);
        }
      }
      
      setIsWaitingForResponse(false);
    } catch (error) {
      console.error('Error in message handling:', error);
      const errorMessage: Message = { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again or try rephrasing your feedback.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueDiscussion = () => {
    setIsWaitingForResponse(true);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'I\'m ready to discuss further. What would you like to clarify or discuss?',
      timestamp: new Date()
    }]);
  };

  const handleEndDiscussion = () => {
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Discussion ended. Your responses have been recorded and will be considered in future analyses.',
      timestamp: new Date()
    }]);
    setTimeout(() => onClose?.(), 2000);
  };

  const handleAcceptAll = async () => {
    try {
      setIsWaitingForResponse(true);
      setMessages(prev => [...prev, 
        { role: 'assistant', content: 'Please explain why you accept these points. This will help inform future analyses.', timestamp: new Date() }
      ]);
    } catch (error) {
      console.error('Error in accept all flow:', error);
    }
  };

  const handleIgnoreAll = async () => {
    try {
      setIsWaitingForResponse(true);
      setMessages(prev => [...prev, 
        { role: 'assistant', content: 'Please explain why you disagree with these points. This will help inform future analyses.', timestamp: new Date() }
      ]);
    } catch (error) {
      console.error('Error in ignore all flow:', error);
    }
  };

  const handleOtherInstructions = () => {
    setIsWaitingForResponse(true);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Please provide your specific instructions or questions about the criticism points. These will be saved as consensus points to inform future analyses.',
      timestamp: new Date()
    }]);
  };

  return (
    <div style={{ 
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100%',
      background: 'white',
      padding: '32px'
    }}>
      {/* Messages Container */}
      <div style={{ 
        flex: 1,
        overflowY: 'auto',
        marginBottom: '24px',
        border: '1px solid #e6e6e6',
        borderRadius: '12px',
        padding: '16px'
      }}>
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
                maxWidth: '100%',
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: message.role === 'user' ? '#4262ff' : '#f5f5f7',
                color: message.role === 'user' ? '#ffffff' : '#050038',
                whiteSpace: 'pre-wrap'
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

      {/* Initial Action Buttons */}
      {messages.length === 1 && (
        <div style={{ 
          display: 'flex',
          gap: '12px',
          marginBottom: '24px'
        }}>
          <button
            onClick={handleAcceptAll}
            className="button button-primary"
            style={{ flex: 1 }}
          >
            Accept All Points
          </button>
          <button
            onClick={handleIgnoreAll}
            className="button button-secondary"
            style={{ flex: 1 }}
          >
            Ignore All Points
          </button>
          <button
            onClick={handleOtherInstructions}
            className="button button-primary"
            style={{ flex: 1, backgroundColor: '#6c757d' }}
          >
            Other Instructions
          </button>
        </div>
      )}

      {/* Input and Control Buttons */}
      {isWaitingForResponse && (
        <div style={{ 
          borderTop: '1px solid #eee',
          paddingTop: '24px'
        }}>
          <div style={{ 
            display: 'flex',
            gap: '12px',
            marginBottom: '16px'
          }}>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type your instructions or questions..."
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '6px',
                border: '1px solid #c3c2cf',
                fontSize: '14px'
              }}
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              className="button button-primary"
              disabled={isLoading || !inputMessage.trim()}
              style={{ minWidth: '100px' }}
            >
              Send
            </button>
          </div>

          {/* Get Response Button */}
          <div style={{ 
            display: 'flex',
            gap: '12px'
          }}>
            <button
              onClick={handleContinueDiscussion}
              className="button button-primary"
              style={{ flex: 1 }}
              disabled={!isWaitingForResponse}
            >
              Get a Response
            </button>
            <button
              onClick={handleEndDiscussion}
              className="button button-secondary"
              style={{ flex: 1 }}
            >
              End Discussion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}; 
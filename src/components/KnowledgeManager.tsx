import React, { useState, useEffect } from 'react';
import { KnowledgeService, KnowledgeDocument } from '../services/knowledgeService';
import { bootstrapKnowledgeBase } from '../utils/bootstrapKnowledge';

/**
 * Component for managing the knowledge base for RAG functionality
 */
export const KnowledgeManager: React.FC = () => {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [newDoc, setNewDoc] = useState({
    title: '',
    content: '',
    type: 'design_principle' as const,
    tags: ''
  });
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [message, setMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);

  // Load documents on mount
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const docs = await KnowledgeService.listDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error('Error fetching documents:', error);
      setMessage({
        text: 'Failed to fetch documents',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddDocument = async () => {
    try {
      if (!newDoc.title.trim()) {
        setMessage({
          text: 'Title is required',
          type: 'error'
        });
        return;
      }

      if (!newDoc.content.trim()) {
        setMessage({
          text: 'Content is required',
          type: 'error'
        });
        return;
      }

      setLoading(true);
      const docIds = await KnowledgeService.addDocument(
        newDoc.title,
        newDoc.content,
        newDoc.type,
        newDoc.tags.split(',').map(t => t.trim()).filter(Boolean)
      );
      
      // Reset form
      setNewDoc({
        title: '',
        content: '',
        type: 'design_principle',
        tags: ''
      });
      
      setMessage({
        text: `Document added successfully (${docIds.length} chunks)`,
        type: 'success'
      });
      
      // Refresh document list
      fetchDocuments();
    } catch (error) {
      console.error('Error adding document:', error);
      setMessage({
        text: 'Failed to add document',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInitializeKnowledgeBase = async () => {
    try {
      setIsInitializing(true);
      const docIds = await bootstrapKnowledgeBase();
      setMessage({
        text: `Knowledge base initialized with ${docIds.length} documents`,
        type: 'success'
      });
      fetchDocuments();
    } catch (error) {
      console.error('Error initializing knowledge base:', error);
      setMessage({
        text: 'Failed to initialize knowledge base',
        type: 'error'
      });
    } finally {
      setIsInitializing(false);
    }
  };

  // Helper to truncate long text
  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="knowledge-manager">
      <h2>Knowledge Base Manager</h2>
      
      {message && (
        <div 
          style={{ 
            padding: '8px 16px', 
            margin: '16px 0', 
            backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
            color: message.type === 'success' ? '#155724' : '#721c24',
            borderRadius: '4px'
          }}
        >
          {message.text}
          <button 
            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setMessage(null)}
          >
            ✕
          </button>
        </div>
      )}
      
      <div style={{ marginBottom: '32px' }}>
        <h3>Initialize Knowledge Base</h3>
        <p>
          Bootstrap the knowledge base with predefined design principles.
          This is useful for setting up the system initially.
        </p>
        <button
          onClick={handleInitializeKnowledgeBase}
          disabled={isInitializing}
          style={{
            padding: '8px 16px',
            backgroundColor: '#4262ff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isInitializing ? 'not-allowed' : 'pointer'
          }}
        >
          {isInitializing ? 'Initializing...' : 'Initialize Knowledge Base'}
        </button>
      </div>
      
      <div style={{ marginBottom: '32px' }}>
        <h3>Add New Document</h3>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>Title:</label>
          <input
            type="text"
            value={newDoc.title}
            onChange={e => setNewDoc({...newDoc, title: e.target.value})}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>Type:</label>
          <select
            value={newDoc.type}
            onChange={e => setNewDoc({...newDoc, type: e.target.value as any})}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
          >
            <option value="design_principle">Design Principle</option>
            <option value="past_analysis">Past Analysis</option>
            <option value="industry_pattern">Industry Pattern</option>
            <option value="user_feedback">User Feedback</option>
          </select>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>Tags (comma-separated):</label>
          <input
            type="text"
            value={newDoc.tags}
            onChange={e => setNewDoc({...newDoc, tags: e.target.value})}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
            placeholder="ui, usability, accessibility"
          />
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>Content:</label>
          <textarea
            value={newDoc.content}
            onChange={e => setNewDoc({...newDoc, content: e.target.value})}
            rows={8}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              fontFamily: 'inherit'
            }}
          />
        </div>
        
        <button
          onClick={handleAddDocument}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#4262ff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Adding...' : 'Add Document'}
        </button>
      </div>
      
      <div>
        <h3>Knowledge Documents ({documents.length})</h3>
        
        {loading && <p>Loading documents...</p>}
        
        {!loading && documents.length === 0 && (
          <p>No documents found. Add a document or initialize the knowledge base.</p>
        )}
        
        {!loading && documents.length > 0 && (
          <div>
            {documents.map(doc => (
              <div 
                key={doc.id}
                style={{
                  padding: '16px',
                  marginBottom: '16px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#f9f9f9'
                }}
              >
                <h4 style={{ margin: '0 0 8px 0' }}>{doc.title}</h4>
                <div style={{ marginBottom: '8px', fontSize: '14px' }}>
                  <span style={{ 
                    backgroundColor: '#e0e0e0', 
                    padding: '2px 6px', 
                    borderRadius: '4px', 
                    marginRight: '8px' 
                  }}>
                    {doc.type}
                  </span>
                  {doc.tags && doc.tags.map(tag => (
                    <span 
                      key={tag} 
                      style={{ 
                        backgroundColor: '#e0f7fa', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        marginRight: '4px',
                        fontSize: '12px'
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p style={{ margin: '8px 0', fontSize: '14px' }}>
                  {truncateText(doc.content, 200)}
                </p>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  ID: {doc.id} | Created: {new Date(doc.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}; 
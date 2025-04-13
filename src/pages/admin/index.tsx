'use client';

import React from 'react';
import Link from 'next/link';

/**
 * Admin dashboard providing access to various admin tools
 */
export default function AdminDashboard() {
  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Admin Dashboard</h1>
      <p>Welcome to the Admin Dashboard. Use the tools below to manage your application.</p>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '20px',
        marginTop: '20px' 
      }}>
        {/* Database Cleanup Card */}
        <div style={{ 
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: '#f8f9fa'
        }}>
          <h2 style={{ margin: '0 0 10px 0' }}>Database Cleanup</h2>
          <p>
            Clean up the database and run maintenance tasks. Clear embeddings cache, view database structure,
            and migrate data to new formats.
          </p>
          <Link 
            href="/admin/database-cleanup"
            style={{
              display: 'inline-block',
              margin: '10px 0 0 0',
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              borderRadius: '4px',
              textDecoration: 'none',
            }}
          >
            Open Database Cleanup
          </Link>
        </div>
        
        {/* Interaction Logs Card */}
        <div style={{ 
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: '#f8f9fa'
        }}>
          <h2 style={{ margin: '0 0 10px 0' }}>Interaction Logs</h2>
          <p>
            View and analyze user interaction data, design proposals, thinking dialogues, 
            consensus points, and design themes stored in the database.
          </p>
          <Link 
            href="/admin/interaction-logs"
            style={{
              display: 'inline-block',
              margin: '10px 0 0 0',
              padding: '8px 16px',
              backgroundColor: '#28a745',
              color: 'white',
              borderRadius: '4px',
              textDecoration: 'none',
            }}
          >
            View Interaction Logs
          </Link>
        </div>
        
        {/* Knowledge Management Card */}
        <div style={{ 
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: '#f8f9fa'
        }}>
          <h2 style={{ margin: '0 0 10px 0' }}>Knowledge Management</h2>
          <p>
            Manage design knowledge, including design principles, industry patterns,
            past analysis, and user feedback.
          </p>
          <Link 
            href="/knowledge"
            style={{
              display: 'inline-block',
              margin: '10px 0 0 0',
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              borderRadius: '4px',
              textDecoration: 'none',
            }}
          >
            Manage Knowledge
          </Link>
        </div>
      </div>
      
      {/* Footer */}
      <div style={{ 
        marginTop: '40px', 
        textAlign: 'center',
        padding: '20px',
        borderTop: '1px solid #eee'
      }}>
        <p style={{ color: '#666', margin: 0 }}>
          CoDesignBot Admin Dashboard
        </p>
      </div>
    </div>
  );
} 
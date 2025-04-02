'use client';
import React, { useState, useEffect } from 'react';
import { DesignThemeService } from '../services/designThemeService';

// Define the animation style
const spinStyle = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

interface DesignTheme {
  name: string;
  description: string;
  relatedPoints: string[];
  color: string;
}

interface DesignThemeDisplayProps {
  refreshTrigger?: number;
}

export const DesignThemeDisplay: React.FC<DesignThemeDisplayProps> = ({ refreshTrigger = 0 }) => {
  const [themes, setThemes] = useState<DesignTheme[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Load themes on mount and when refreshTrigger changes
  useEffect(() => {
    console.log(`DesignThemeDisplay: refreshTrigger changed to ${refreshTrigger}, reloading themes`);
    loadThemes();
  }, [refreshTrigger]);
  
  // Function to load themes
  const loadThemes = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log("DesignThemeDisplay: Starting to load themes...");
      
      // Add a small delay to ensure any previous API calls have completed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        const result = await DesignThemeService.getCurrentThemesFromBoard();
        console.log(`DesignThemeDisplay: Successfully loaded ${result.length} themes`);
        setThemes(result);
      } catch (apiError) {
        // Specific handling for the parentId validation error
        if (apiError instanceof Error && 
            apiError.message.includes('Validation error') && 
            apiError.message.includes('parentId')) {
          console.warn("DesignThemeDisplay: Caught parentId validation error, retrying with a different approach");
          
          // Set error for user feedback
          setError('Error with Miro API. Please try regenerating the themes.');
          
          // Reset themes
          setThemes([]);
        } else {
          // Re-throw other errors
          throw apiError;
        }
      }
    } catch (err) {
      console.error('DesignThemeDisplay: Error loading themes:', err);
      setError('Unable to load design themes. Please try again or refresh the board.');
      
      // More detailed error logging
      if (err instanceof Error) {
        console.error(`DesignThemeDisplay: Error details: ${err.message}`);
        console.error(`DesignThemeDisplay: Error stack: ${err.stack}`);
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Handle refresh button click
  const handleRefresh = () => {
    console.log("DesignThemeDisplay: Manual refresh requested");
    loadThemes();
  };
  
  // Handle generate themes button click
  const handleGenerateThemes = async () => {
    try {
      setIsGenerating(true);
      console.log("DesignThemeDisplay: Generating new themes...");
      
      await DesignThemeService.generateAndVisualizeThemes(false);
      
      // Wait a moment for the themes to be created
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      await loadThemes();
    } catch (err) {
      console.error('DesignThemeDisplay: Error generating themes:', err);
      setError('Failed to generate themes. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Color to background style converter
  const getColorStyle = (colorName: string): React.CSSProperties => {
    const colorMap: Record<string, string> = {
      'light_green': '#C3E5B5',
      'light_blue': '#BFE3F2',
      'light_yellow': '#F5F7B5',
      'light_pink': '#F5C3C2',
      'violet': '#D5C8E8',
      'light_gray': '#E5E5E5'
    };
    
    return {
      backgroundColor: colorMap[colorName] || '#E5E5E5'
    };
  };
  
  // Loading state
  if (loading && themes.length === 0) {
    return (
      <div className="design-theme-loading">
        <p>Loading design themes...</p>
      </div>
    );
  }
  
  // Error state
  if (error && themes.length === 0) {
    return (
      <div className="design-theme-error">
        <p>{error}</p>
        <button 
          onClick={handleRefresh}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            backgroundColor: '#f0f0f0',
            cursor: 'pointer'
          }}
        >
          Try Again
        </button>
      </div>
    );
  }
  
  // Empty state
  if (themes.length === 0) {
    return (
      <div className="design-theme-empty" style={{ textAlign: 'center', padding: '10px' }}>
        <p style={{ marginBottom: '10px' }}>No design themes found.</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button 
            onClick={handleRefresh}
            disabled={loading || isGenerating}
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              backgroundColor: '#f0f0f0',
              cursor: (loading || isGenerating) ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh Themes'}
          </button>
          <button 
            onClick={handleGenerateThemes}
            disabled={loading || isGenerating}
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              backgroundColor: '#e6f7ff',
              cursor: (loading || isGenerating) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {isGenerating ? 'Generating...' : 'Generate Themes'}
            {isGenerating && (
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span>
            )}
          </button>
        </div>
      </div>
    );
  }
  
  // Main component render
  return (
    <div className="design-theme-container">
      {/* Include the animation style */}
      <style dangerouslySetInnerHTML={{ __html: spinStyle }} />
      
      <div className="design-theme-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px'
      }}>
        {error && (
          <div style={{
            color: '#d9534f',
            fontSize: '14px',
            marginRight: '10px'
          }}>
            {error}
          </div>
        )}
        <button 
          onClick={handleRefresh}
          disabled={loading}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            backgroundColor: '#f0f0f0',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh Themes'}
          {loading && (
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span>
          )}
        </button>
      </div>
      
      <div className="design-theme-list">
        {themes.map((theme) => (
          <div 
            key={theme.name} 
            className="design-theme-item"
            style={{
              marginBottom: '12px',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
              overflow: 'hidden'
            }}
          >
            <div 
              className="theme-header" 
              style={{
                ...getColorStyle(theme.color),
                padding: '8px 12px',
                fontWeight: 600
              }}
            >
              {theme.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}; 
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
  isSelected?: boolean;
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
        
        // Restore selection state from localStorage if available
        let themesWithSelection = result;
        if (typeof window !== 'undefined') {
          try {
            const savedSelectionJson = localStorage.getItem('themeSelectionState');
            if (savedSelectionJson) {
              const savedSelection = JSON.parse(savedSelectionJson);
              
              // Apply saved selection to new themes
              if (Array.isArray(savedSelection)) {
                themesWithSelection = result.map(theme => {
                  // Look for a matching theme in the saved selection
                  const savedTheme = savedSelection.find(saved => 
                    saved.name.toLowerCase() === theme.name.toLowerCase() ||
                    saved.name.toLowerCase().includes(theme.name.toLowerCase()) ||
                    theme.name.toLowerCase().includes(saved.name.toLowerCase())
                  );
                  
                  // If found, use its selection state, otherwise default to selected
                  return {
                    ...theme,
                    isSelected: savedTheme ? savedTheme.isSelected : true
                  };
                });
              }
            } else {
              // No saved selection, default all to selected
              themesWithSelection = result.map(theme => ({
                ...theme,
                isSelected: true
              }));
            }
          } catch (e) {
            console.error('Error restoring theme selection from localStorage:', e);
            // Default all to selected if there's an error
            themesWithSelection = result.map(theme => ({
              ...theme,
              isSelected: true
            }));
          }
        }
        
        setThemes(themesWithSelection);
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
  
  // Toggle theme selection
  const toggleThemeSelection = (themeIndex: number) => {
    setThemes(prevThemes => {
      const updatedThemes = prevThemes.map((theme, idx) => 
        idx === themeIndex 
          ? { ...theme, isSelected: theme.isSelected === false ? true : false } 
          : theme
      );
      
      // Save selection state to localStorage
      saveSelectionToLocalStorage(updatedThemes);
      
      return updatedThemes;
    });
  };
  
  // Select all themes
  const selectAllThemes = () => {
    setThemes(prevThemes => {
      const updatedThemes = prevThemes.map(theme => ({ 
        ...theme, 
        isSelected: true 
      }));
      
      // Save selection state to localStorage
      saveSelectionToLocalStorage(updatedThemes);
      
      return updatedThemes;
    });
  };
  
  // Deselect all themes
  const deselectAllThemes = () => {
    setThemes(prevThemes => {
      const updatedThemes = prevThemes.map(theme => ({ 
        ...theme, 
        isSelected: false 
      }));
      
      // Save selection state to localStorage
      saveSelectionToLocalStorage(updatedThemes);
      
      return updatedThemes;
    });
  };
  
  // Save theme selection state to localStorage
  const saveSelectionToLocalStorage = (themesToSave: DesignTheme[]) => {
    if (typeof window !== 'undefined') {
      try {
        const selectionState = themesToSave.map(theme => ({
          name: theme.name,
          isSelected: theme.isSelected !== false
        }));
        
        localStorage.setItem('themeSelectionState', JSON.stringify(selectionState));
      } catch (e) {
        console.error('Error saving theme selection to localStorage:', e);
      }
    }
  };
  
  // Color to background style converter
  const getColorStyle = (colorName: string, isSelected: boolean = true): React.CSSProperties => {
    const colorMap: Record<string, string> = {
      'light_green': '#C3E5B5',
      'light_blue': '#BFE3F2',
      'light_yellow': '#F5F7B5',
      'light_pink': '#F5C3C2',
      'violet': '#D5C8E8',
      'light_gray': '#E5E5E5'
    };
    
    const style: React.CSSProperties = {
      backgroundColor: colorMap[colorName] || '#E5E5E5'
    };
    
    // Add grayscale filter if not selected
    if (!isSelected) {
      style.filter = 'grayscale(100%)';
      style.opacity = 0.7;
    }
    
    return style;
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
  
  // Get count of selected themes
  const selectedCount = themes.filter(theme => theme.isSelected !== false).length;
  
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
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Help text explaining theme selection */}
          <div style={{ 
            fontSize: '12px', 
            color: '#666', 
            marginRight: '8px', 
            display: 'flex', 
            alignItems: 'center' 
          }}>
            <span style={{ 
              backgroundColor: '#f0f7ff', 
              borderRadius: '50%', 
              width: '18px', 
              height: '18px', 
              display: 'inline-flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginRight: '4px',
              fontSize: '11px' 
            }}>
              i
            </span>
            <span>{selectedCount} of {themes.length} selected</span>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={selectAllThemes}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              backgroundColor: '#f0f0f0',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Select All
          </button>
          <button 
            onClick={deselectAllThemes}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              backgroundColor: '#f8f8f8',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Deselect All
          </button>
          <button 
            onClick={handleRefresh}
            disabled={loading}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              backgroundColor: '#f0f0f0',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px'
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh Themes'}
            {loading && (
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span>
            )}
          </button>
        </div>
      </div>
      
      {/* Theme selection help text */}
      <div style={{ 
        marginBottom: '10px',
        backgroundColor: '#f9f9f9',
        border: '1px dashed #ddd',
        borderRadius: '4px',
        padding: '8px',
        fontSize: '12px',
        color: '#555'
      }}>
        <p>Click on a theme to toggle its selection. Selected themes (full color) will receive points during analysis, while deselected themes (grayscale) will be excluded.</p>
      </div>
      
      <div className="design-theme-list">
        {themes.map((theme, index) => {
          // Default to selected if not explicitly deselected
          const isSelected = theme.isSelected !== false;
          
          return (
            <div 
              key={theme.name} 
              className="design-theme-item"
              onClick={() => toggleThemeSelection(index)}
              style={{
                marginBottom: '12px',
                border: `1px solid ${isSelected ? theme.color : '#e0e0e0'}`,
                borderRadius: '6px',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              <div 
                className="theme-header" 
                style={{
                  ...getColorStyle(theme.color, isSelected),
                  padding: '8px 12px',
                  fontWeight: 600,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>{theme.name}</span>
                <span style={{ 
                  fontSize: '11px', 
                  backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)',
                  padding: '2px 6px', 
                  borderRadius: '10px',
                  fontWeight: 'normal'
                }}>
                  {isSelected ? 'Selected' : 'Deselected'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}; 
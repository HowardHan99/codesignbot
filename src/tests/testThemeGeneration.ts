/**
 * Test script for design theme generation
 * Run this in the browser console while on the Miro app page
 */

import { DesignThemeService } from '../services/designThemeService';

/**
 * Test function for generating design themes
 */
export async function testGenerateThemes() {
  console.log('Starting theme generation test...');
  
  try {
    // Test getting design proposals
    const designProposals = await DesignThemeService['getDesignProposals']();
    console.log(`Found ${designProposals.length} design proposals:`, designProposals);
    
    // Test getting thinking dialogue
    const thinkingDialogue = await DesignThemeService['getThinkingDialogue']();
    console.log(`Found ${thinkingDialogue.length} thinking dialogue notes:`, thinkingDialogue);
    
    // Only proceed if we have content to work with
    if (designProposals.length === 0 && thinkingDialogue.length === 0) {
      console.error('No design content found to generate themes from');
      return;
    }
    
    // Test theme generation
    console.log('Generating design themes...');
    const themes = await DesignThemeService.generateDesignThemes();
    console.log(`Generated ${themes.length} design themes:`, themes);
    
    // Test theme visualization
    console.log('Visualizing design themes...');
    await DesignThemeService.visualizeThemes(themes);
    console.log('Theme visualization complete');
    
  } catch (error) {
    console.error('Error in theme generation test:', error);
  }
}

// Example test data for manual testing without Miro content
export async function testWithMockData() {
  const mockDesignProposals = [
    "Create a user-friendly interface that prioritizes accessibility features",
    "Implement a responsive design that works well on mobile devices",
    "Include night mode and customizable color themes for better user experience",
    "Add voice control capabilities for hands-free interaction",
    "Create a coherent visual style with consistent typography and color palette"
  ];
  
  const mockThinkingDialogue = [
    "We should focus on making the interface intuitive and easy to navigate",
    "User testing reveals a need for larger touch targets for elderly users",
    "Performance optimization is crucial for users with lower-end devices",
    "The color contrast should meet WCAG AA standards at minimum",
    "We need to consider international users with right-to-left language support"
  ];
  
  try {
    // Override theme generation method for testing
    const originalMethod = DesignThemeService['analyzeContentForThemes'];
    DesignThemeService['analyzeContentForThemes'] = async () => {
      return [
        {
          name: "Accessibility",
          description: "Features and approaches focused on making the app usable for all users regardless of abilities.",
          relatedPoints: [
            "Create a user-friendly interface that prioritizes accessibility features",
            "User testing reveals a need for larger touch targets for elderly users",
            "The color contrast should meet WCAG AA standards at minimum"
          ],
          color: "light_green"
        },
        {
          name: "User Experience",
          description: "Elements that enhance the overall user experience and satisfaction.",
          relatedPoints: [
            "Include night mode and customizable color themes for better user experience",
            "We should focus on making the interface intuitive and easy to navigate",
            "Add voice control capabilities for hands-free interaction"
          ],
          color: "light_blue"
        },
        {
          name: "Responsive Design",
          description: "Approaches to ensure the application works well across different devices and contexts.",
          relatedPoints: [
            "Implement a responsive design that works well on mobile devices",
            "Performance optimization is crucial for users with lower-end devices",
            "We need to consider international users with right-to-left language support"
          ],
          color: "light_yellow"
        },
        {
          name: "Visual Design",
          description: "Elements focused on visual aesthetics and brand consistency.",
          relatedPoints: [
            "Create a coherent visual style with consistent typography and color palette",
            "The color contrast should meet WCAG AA standards at minimum"
          ],
          color: "light_pink"
        }
      ];
    };
    
    // Run the visualization with mock data
    const themes = await DesignThemeService['analyzeContentForThemes']([], []);
    await DesignThemeService.visualizeThemes(themes);
    console.log('Mock theme visualization complete');
    
    // Restore original method
    DesignThemeService['analyzeContentForThemes'] = originalMethod;
    
  } catch (error) {
    console.error('Error in mock theme generation test:', error);
  }
} 
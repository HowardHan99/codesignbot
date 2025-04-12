import { KnowledgeService } from '../services/knowledgeService';

const designPrinciples = [
  {
    title: 'What is a Wicked Problem',
    content: `A wicked problem is a social or cultural problem that's difficult or impossible to solve because of its complex and interconnected nature. Wicked problems lack clarity in both their aims and solutions, and are subject to real-world constraints which hinder risk-free attempts to find a solution.

Classic examples of wicked problems include:
- Poverty
- Climate change
- Education
- Homelessness
- Sustainability

Many design problems we face are wicked problems, where clarifying the problem is often as big a task as solving it. What makes them particularly challenging is how they're intertwined with one another - if you try to address an element of one problem, you'll likely cause unexpected consequences in another.`,
    type: 'design_principle' as const,
    tags: ['wicked-problems', 'complexity', 'problem-solving']
  },
  {
    title: '10 Characteristics of Wicked Problems',
    content: `According to Horst W.J. Rittel and Melvin M. Webber from UC Berkeley, wicked problems have ten defining characteristics:

1. There is no definitive formula for a wicked problem
2. Wicked problems have no stopping rule—there's no way to know whether your solution is final
3. Solutions to wicked problems are not true or false (right or wrong); they can only be good or bad
4. You cannot immediately test a solution to a wicked problem
5. Every solution to a wicked problem is a "one-shot operation" because there is no opportunity to learn by trial and error
6. Wicked problems do not have a set number of potential solutions
7. Every wicked problem is essentially unique
8. Every wicked problem can be considered a symptom of another problem
9. There is always more than one explanation for a wicked problem because explanations vary greatly depending on individual perspective
10. The planner/designer has no right to be wrong and must be fully responsible for their actions

Business strategy is often classed as a wicked problem because strategy-related issues typically meet at least five of these characteristics.`,
    type: 'design_principle' as const,
    tags: ['wicked-problems', 'characteristics', 'problem-solving']
  },
  {
    title: 'Complex Socio-Technical Systems',
    content: `The rapid technological advancement of the 21st century has mutated wicked problems. In today's hyperconnected world, problems cannot be looked at in isolation. Don Norman refers to these as complex socio-technical systems.

Take sustainability and recycling as an example. Recycling itself presents complex challenges with different rules for different materials (paper, plastics, glass, metals) and varying processes across locations. However, the need for recycling stems from deeper systemic issues - the use of non-reusable materials in manufacturing, planned obsolescence in product design, and lack of circular economy practices.

Complex socio-technical systems are intertwined within multiple existing systems:
- Manufacturing systems
- Economic systems
- Political systems
- Social and cultural systems
- Technological systems
- Legal systems

Each of these systems is connected with the others, making it impossible to address one aspect without considering its impact on the entire system.`,
    type: 'design_principle' as const,
    tags: ['socio-technical-systems', 'sustainability', 'systems-thinking']
  },
  {
    title: 'Tackling Wicked Problems with Systems Thinking and Agile Methodology',
    content: `To address wicked problems effectively, a combination of systems thinking and agile methodology is recommended:

Systems Thinking:
- Understanding how components of a system influence each other and other systems
- Considering the broader context and interconnections
- Identifying feedback loops and patterns
- Recognizing emergence and unintended consequences

Agile Methodology:
- Taking an iterative approach to design and development
- Improving solutions through collaboration
- Adapting to change rather than following a rigid plan
- Breaking down complex problems into manageable pieces

This combined approach allows teams to:
1. Understand the broader context of the problem
2. Identify key stakeholders and their relationships
3. Recognize patterns and interconnections
4. Test and iterate solutions in a controlled manner
5. Adapt strategies based on feedback and learning

The key is to avoid seeking perfect solutions and instead focus on creating positive change while being mindful of potential ripple effects throughout the system.`,
    type: 'design_principle' as const,
    tags: ['systems-thinking', 'agile-methodology', 'problem-solving']
  },
  {
    title: 'Design Thinking Process',
    content: `Design Thinking is a non-linear, iterative process that teams use to understand users, challenge assumptions, redefine problems and create innovative solutions to prototype and test. The five phases of Design Thinking are: Empathize, Define, Ideate, Prototype, and Test. This approach is particularly valuable for tackling complex problems that are ill-defined or unknown.

In the Empathize phase, designers immerse themselves in the user's experience through observation and engagement. The Define phase focuses on framing the problem statement based on user needs. During Ideation, teams generate a wide range of creative solutions. Prototyping involves creating simplified versions of the solution for testing. Finally, the Test phase gathers user feedback on the prototypes to refine the solution further.

Design Thinking encourages teams to focus on users, challenge assumptions, address root problems (not symptoms), collaborate across disciplines, and quickly visualize ideas for validation.`,
    type: 'design_principle' as const,
    tags: ['process', 'methodology', 'user-centered']
  },
  {
    title: 'User Interface Consistency',
    content: `Consistency in user interface design creates systems that are easier to use and learn by leveraging users' expectations. This principle manifests in several ways:

1. Visual consistency: Using the same colors, typography, and UI elements throughout the application
2. Functional consistency: Ensuring similar features work the same way everywhere 
3. External consistency: Following platform conventions and standards familiar to users

Consistent interfaces reduce cognitive load, accelerate learning, and increase user confidence. When elements behave predictably, users can apply previous knowledge to new screens and features. This reduces errors, frustration, and the need for extensive help documentation.

However, consistency should never override clarity or usability. Occasionally breaking consistency for a much clearer interaction can be justified, especially when user research validates this decision.`,
    type: 'design_principle' as const,
    tags: ['ui', 'usability', 'consistency']
  },
  {
    title: 'Accessibility in Design',
    content: `Accessibility in design ensures that products, services, and environments are usable by people with a wide range of abilities, disabilities, and other characteristics. Accessible design benefits not just people with disabilities but all users in various contexts.

Key accessibility principles include:

1. Perceivable: Information must be presentable in ways all users can perceive, including text alternatives for non-text content, captions for multimedia, and adaptable presentation.

2. Operable: User interface components must be operable by all users. This includes keyboard accessibility, sufficient time to read content, and avoiding content that could cause seizures.

3. Understandable: Information and operation of the user interface must be understandable. This means readable text, predictable functionality, and input assistance.

4. Robust: Content must be robust enough to be interpreted reliably by a wide variety of user agents, including assistive technologies.

Incorporating accessibility from the beginning of the design process is more efficient than retrofitting existing designs. It involves considering diverse users, following standards like WCAG, and conducting usability testing with people with disabilities.`,
    type: 'design_principle' as const,
    tags: ['accessibility', 'inclusivity', 'usability']
  },
  {
    title: 'Visual Hierarchy',
    content: `Visual hierarchy is the principle of arranging elements to show their order of importance. Designers use visual hierarchy to guide users through a specific path for optimal understanding of the content and functionality.

Key techniques to establish visual hierarchy include:

1. Size and scale: Larger elements attract attention first and are perceived as more important.

2. Color and contrast: Bright colors and high contrast elements stand out against their surroundings.

3. Typography: Font style, size, weight, and spacing communicate importance and relationships.

4. Spacing and proximity: Related items placed close together are perceived as a group, while whitespace can emphasize important elements.

5. Alignment and positioning: Elements positioned at the top of a layout are typically seen first in cultures that read from top to bottom.

Effective visual hierarchy ensures users can quickly scan content, understand relationships between elements, and focus on the most important information or actions first. It reduces cognitive load by organizing information logically and predictably.`,
    type: 'design_principle' as const,
    tags: ['visual-design', 'composition', 'user-attention']
  },
  {
    title: 'Feedback and Affordance',
    content: `Feedback and affordance are crucial principles in interaction design that help users understand how to interact with an interface and confirm their actions.

Affordance refers to the perceived properties of an object that suggest how it should be used. In digital interfaces, affordances provide visual cues about functionality:
- Buttons with depth or shadows suggest they can be pressed
- Text fields with borders or backgrounds suggest they can receive input
- Underlined text suggests it's a hyperlink

Feedback is the response a system provides after a user action. Effective feedback:
- Confirms that an action was registered
- Indicates whether the action was successful or failed
- Communicates the system's current state
- Guides users toward next steps

Types of feedback include:
1. Visual: Color changes, animations, progress indicators
2. Auditory: Sounds confirming clicks, errors, or completions
3. Haptic: Vibrations or tactile responses (in physical or mobile interfaces)

Good feedback should be immediate, appropriate to the action's importance, and consistent throughout the interface. Without proper feedback, users may become confused, repeat actions unnecessarily, or abandon the interface altogether.`,
    type: 'design_principle' as const,
    tags: ['interaction', 'usability', 'user-experience']
  }
];

/**
 * Bootstrap the knowledge base with initial design principles
 * @returns Promise resolving to an array of generated document IDs
 */
export async function bootstrapKnowledgeBase(): Promise<string[]> {
  console.log('Starting knowledge base bootstrap...');
  const allDocIds: string[] = [];
  
  for (const principle of designPrinciples) {
    try {
      console.log(`Adding: ${principle.title}`);
      const docIds = await KnowledgeService.addDocument(
        principle.title,
        principle.content,
        principle.type,
        principle.tags
      );
      allDocIds.push(...docIds);
      console.log(`Added ${docIds.length} chunks for ${principle.title}`);
    } catch (error) {
      console.error(`❌ ERROR ADDING ${principle.title}:`, error);
      if (error instanceof Error) {
        console.error('🔥 ERROR DETAILS:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      // Log the first 100 characters of the principle content for debugging
      console.error('Content preview:', principle.content.substring(0, 100) + '...');
    }
  }
  
  console.log(`Knowledge base bootstrap complete! Added ${allDocIds.length} total documents.`);
  return allDocIds;
} 
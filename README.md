# Adding New Miro Boards

## Prerequisites
- A Miro account with access to the board you want to add
- The Board ID of your Miro board (found in the board's URL: `https://miro.com/app/board/YOUR_BOARD_ID=`)
- OAuth token for the board (if not using the default board)
- OpenAI API key (for GPT-4 model access)
- Anthropic API key (for Claude model access, optional)
- Azure OpenAI API access (for GPT O3 model access, optional)
- Google Gemini API key (for Gemini model access, optional)
- Node.js and npm installed on your machine

## Installation and Running the Application

1. Clone the repository
```
git clone https://github.com/yourusername/codesignbot.git
cd codesignbot
```

2. Install dependencies
```
npm install
```

3. Set up environment variables (as described in the next section)

4. Start the development server
```
npm start
```

5. Open your browser and navigate to `http://localhost:3000`

6. For production builds, use:
```
npm run build
```

## Miro Integration Setup

### Creating a Miro App

1. [Sign in](https://miro.com/login/) to Miro, and create a [Developer team](https://developers.miro.com/docs/create-a-developer-team) under your account.

2. [Create an app in Miro](https://developers.miro.com/docs/build-your-first-hello-world-app#step-2-create-your-app-in-miro):
   - Click the **Create new app** button.
   - On the **Create new app** modal, give your app a name, assign it to your Developer team, and click **Create**.

3. Configure the app:
   - In your account profile, go to **Your apps**, and select the app you just created.
   - On the app configuration page, go to **App Credentials**, and copy the **Client ID** and **Client secret** values.
   - Go to **App URL** and enter: `http://localhost:3000` (for development) or your production URL.
   - Go to **Redirect URI for OAuth2.0**, and enter: `http://localhost:3000/api/redirect` (for development) or your production redirect URL.
   - Click **Options** and select **Use this URI for SDK authorization**.
   - Go to **Permissions**, and select the following permissions:
     - `board:read`
     - `board:write`

4. Add these credentials to your `.env` file:
```env
MIRO_CLIENT_ID="your_client_id"
MIRO_CLIENT_SECRET="your_client_secret"
MIRO_REDIRECT_URL="http://localhost:3000/api/redirect"
```

### Setting Up Your Miro Board

1. Create a new board in Miro with the following frames:
   - `Design-Proposal`: For design decision sticky notes
   - `Antagonistic-Response`: For analysis responses
   - `Thinking-Dialogue`: For AI thinking process
   - `Real-time-response`: For real-time responses
   - `Consensus`: For consensus decisions
   - `Design-Challenge`: For defining the design challenge
   - `Sketch-Reference`: For design sketches and images
   - `Incorporate suggestions`: For additional suggestions

2. Get your Board ID from the URL:
   - Open your Miro board
   - Copy the ID from the URL (e.g., `uXjVNzqQxNs=` from `https://miro.com/app/board/uXjVNzqQxNs=/`)

3. Add the Board ID to your `.env` file:
```env
NEXT_PUBLIC_MIRO_BOARD_ID="your_board_id"
```

4. When the application runs, it will connect to this board automatically.

### Verifying the Miro Integration

To verify that your Miro integration is working correctly:

1. Start the application with `npm start`
2. Open your browser to `http://localhost:3000`
3. You should see an option to connect to your Miro board
4. Click the "Login to Board" button and authorize the application when prompted
5. Once authorized, the application should connect to your board and display confirmation
6. If you open your Miro board in another tab, you should see the app icon in the left toolbar
7. Click the app icon to interact with the application directly from Miro

### Troubleshooting Miro Integration

If you encounter issues with the Miro integration:

1. Ensure all required environment variables are set correctly
2. Check that your Miro app has the correct permissions (`board:read` and `board:write`)
3. Verify that the redirect URL in your Miro app configuration matches your environment setup
4. Clear browser cookies and local storage if you encounter authentication issues
5. Check the browser console for any error messages related to the Miro SDK
6. Ensure your Miro board contains all the required frames as specified above
7. For more detailed guidance, visit the [Miro Developer Platform documentation](https://developers.miro.com/docs/guided-onboarding)

## Firebase Integration Setup

This application uses Firebase for data storage, vector search, and agent memory. Follow these steps to set up Firebase:

### Creating a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/) and sign in with your Google account
2. Click **Add project** and follow the setup wizard to create a new Firebase project
3. Give your project a name and complete the setup process

### Setting Up Firestore Database

1. In your Firebase project dashboard, click on **Firestore Database** in the left sidebar
2. Click **Create database** if you haven't already set up Firestore
3. Choose a starting mode for your security rules (start with **Test mode** for development)
4. Select a location for your Firestore database that's closest to your users
5. Click **Enable**

### Deploying Firebase Indexes

The application requires specific indexes for vector search and other queries:

1. Install the Firebase CLI if you haven't already:
   ```
   npm install -g firebase-tools
   ```

2. Log in to Firebase from the CLI:
   ```
   firebase login
   ```

3. Initialize Firebase in your project directory (if not already done):
   ```
   firebase init
   ```
   - Select **Firestore** and **Hosting** when prompted
   - Choose your Firebase project
   - Use the default options for the rest of the setup

4. Deploy the Firestore indexes using:
   ```
   firebase deploy --only firestore:indexes
   ```

### Setting Up Firebase Authentication

1. In your Firebase project dashboard, click on **Authentication** in the left sidebar
2. Click **Get started** if you haven't already set up Authentication
3. Enable the authentication methods you want to use (Anonymous authentication is used for testing)

### Configuring Environment Variables

Add the following Firebase configuration to your `.env` file:

```env
GOOGLE_APPLICATION_CREDENTIALS="path_to_your_service_account_key.json"
FIREBASE_PROJECT_ID="your_firebase_project_id"
```

### Generating a Service Account Key (For Server-Side Access)

1. In your Firebase project dashboard, go to **Project settings** > **Service accounts**
2. Click **Generate new private key** to download a JSON file containing your service account credentials
3. Store this file securely and set the path in your `GOOGLE_APPLICATION_CREDENTIALS` environment variable

### Testing Firebase Integration

To verify your Firebase setup is working correctly:

1. Run the Firebase authentication test:
   ```
   npx tsx src/tests/testFirestoreAuth.js
   ```

2. If all tests pass, your Firebase integration is configured correctly
3. If you encounter errors, check your service account permissions and Firestore rules

## Method 1: Using Environment Variables (Recommended for Development)

1. Open your `.env` file in the project root
2. Add or update the following variables:
```env
NEXT_PUBLIC_MIRO_OAUTH_TOKEN="your_oauth_token"
NEXT_PUBLIC_MIRO_BOARD_ID="your_board_id"
OPENAI_API_KEY="your_openai_api_key"
ANTHROPIC_API_KEY="your_anthropic_api_key" # Optional, only needed for Claude model
```
3. Restart your development server
4. The application will automatically connect to the specified board

## Designer Role Play Options

The designer role play feature offers multiple AI model options with different strengths:

### GPT-4 (Balanced)
- Provides well-structured, consistent design thinking
- Excellent for methodical problem-solving approaches
- Balances analytical and creative thinking

### Claude (Creative)
- Offers more explorative and creative design approaches
- May generate more novel or unexpected insights
- Better for open-ended or innovative design challenges

### GPT O3 (Fast)
- Quicker response times than GPT-4
- Cost-effective for iterative design explorations
- Good balance of speed and quality
- Uses Azure OpenAI integration (requires Azure setup)

### Gemini 2.5 Pro (Visual)
- Strong visual understanding capabilities
- Well-suited for design challenges with visual components
- Good at generating creative, diverse solutions

To use these options:
1. Select your preferred model from the dropdown in the designer role play section
2. Click "Role Play Designer"
3. View the thinking process in the "Thinking-Dialogue" frame
4. Review design decisions in the "Design-Proposal" frame

### Claude 3.7 Extended Thinking

When using the Claude option, the system will exclusively use Claude 3.7 Sonnet with the extended thinking feature. This provides:

- Detailed visibility into Claude's reasoning process
- Step-by-step breakdown of how it approaches the design challenge
- More transparent explanation of design decisions and tradeoffs
- Deeper insights into the AI's problem-solving methodology

The extended thinking appears in the "Thinking-Dialogue" frame, while the final design decisions appear in the "Design-Proposal" frame. This separation helps distinguish between the AI's reasoning process and its final recommendations.

**Technical Note**: The Claude 3.7 API requires the `thinking` parameter to be passed as an object with two required fields: `{ type: 'enabled', budget_tokens: 4000 }`. The `type` field must be set to 'enabled' and the `budget_tokens` field determines the maximum tokens allocated for the thinking process.

Additionally, when using extended thinking, the `max_tokens` parameter must always be greater than the `budget_tokens` value. In our implementation, we set `max_tokens: 8000` and `budget_tokens: 4000` to satisfy this requirement while providing sufficient space for both reasoning and final response content.

The thinking content is returned in the response's `content` array as blocks with `type: 'thinking'`. These blocks contain their thinking content in the `thinking` property (not the `text` property), and also include a `signature` field that verifies the content was generated by Claude. These thinking blocks need to be extracted and processed separately from the standard text content blocks (which have `type: 'text'`).

## Troubleshooting Claude Integration

If you experience issues with the Claude option:

1. **API Key**: Verify your Anthropic API key is correct and starts with `sk-ant-`
2. **API Key Format**: Make sure your API key is properly added to your `.env` file without any extra spaces
3. **Authentication**: If you see a 401 error, your API key may be invalid or expired
4. **Access**: If you see a 403 error, your API key may not have access to the Claude 3.7 Sonnet model
5. **Model Name**: If you see a 404 "not found" error with message "model: ...", make sure you're using the correct model name format - we use `claude-3-7-sonnet-20250219` which includes the version date
6. **Rate Limits**: A 429 error indicates you've exceeded your Anthropic API rate limits
7. **Service Availability**: 500-level errors often indicate temporary issues with the Claude API itself
8. **Validation Errors**: If you see validation errors about:
   - `thinking.type`: Make sure you're passing the correct `type` field in the thinking parameter
   - `thinking.budget_tokens`: Ensure you're setting the token budget in the thinking parameter
   - `max_tokens must be greater than`: Check that your max_tokens is greater than budget_tokens
   - Content extraction errors: The implementation extracts thinking content from blocks with `type: 'thinking'`

### Claude API Best Practices

The Claude API has specific formatting requirements:

1. **Proper Message Structure**: Messages must be formatted as objects with proper `role` and `content` structure
2. **Content Array Format**: The content field should be an array of content blocks with type specifications
   ```json
   { 
     "role": "user", 
     "content": [
       {
         "type": "text",
         "text": "Your message here"
       }
     ]
   }
   ```
3. **Extended Thinking Format**: When using the thinking feature, use the proper structure:
   ```json
   { 
     "thinking": {
       "type": "enabled",
       "budget_tokens": 4000
     },
     "max_tokens": 8000
   }
   ```
4. **Thinking Block Structure**: The API returns thinking content in the following format:
   ```json
   {
     "type": "thinking",
     "thinking": "Let me analyze this step by step...",
     "signature": "WaUjzkypQ2mUEVM36O2TxuC06KN8xyfbJwyem2dw3URve/op91XWHOEBLLqIOMfFG/UvLEczmEsUjavL...."
   }
   ```
5. **Token Limits**: Claude has limits on the number of tokens per request:
   - Tier 1: 50 requests/minute, 40,000 input tokens/minute, 8,000 output tokens/minute
   - Higher tiers have increased limits

6. **Error Handling**: Implement robust error handling to catch validation errors, which are common when working with the Claude API

## Method 2: Using the UI (For Additional Boards)

1. If no board is connected, you'll see the "Add Another Board" section
2. Find your Board ID from the Miro board URL
   - Open your Miro board
   - Copy the ID from the URL (e.g., `uXjVNzqQxNs=` from `https://miro.com/app/board/uXjVNzqQxNs=/`)
3. Enter the Board ID in the input field
4. Click "Add Board"
5. Click the "Login to Board" button that appears
6. Authorize the application in the Miro popup
7. The board will be added to your application

## Board Requirements

Your Miro board should have the following frames:
- `Design-Proposal`: For design decision sticky notes
- `Antagonistic-Response`: For analysis responses
- `Thinking-Dialogue`: For AI thinking process
- `Real-time-response`: For real-time responses
- `Consensus`: For consensus decisions
- `Design-Challenge`: For defining the design challenge
- `Sketch-Reference`: For design sketches and images
- `Incorporate suggestions`: For additional suggestions

## Troubleshooting

If you encounter issues:
1. Ensure your OAuth token is valid and has the correct permissions
2. Check that the Board ID is correct and the board exists
3. Clear your browser cache and local storage
4. Restart the development server
5. Ensure you have the necessary permissions on the Miro board

## Security Notes

- Keep your OAuth tokens secure and never commit them directly to the repository
- Use environment variables for sensitive information
- Regularly rotate OAuth tokens for security
- Consider using different tokens for development and production environments

## Azure OpenAI Integration (For GPT O3)

The GPT O3 model is accessed through Azure OpenAI Service. To set up this integration:

1. Create an Azure OpenAI resource and deploy the O3 model (see detailed instructions in `docs/azure-openai-setup.md`)
2. Add the following environment variables to your `.env` file:
```env
AZURE_OPENAI_API_KEY=your-azure-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_API_VERSION=2023-05-15
AZURE_OPENAI_O3_DEPLOYMENT=your-o3-deployment-name
```

For complete setup instructions, refer to the [Azure OpenAI Setup Guide](docs/azure-openai-setup.md).

### Fallback Mechanism

If you don't have Azure OpenAI set up, the system will automatically fall back to using the direct OpenAI API for GPT O3 requests. This requires:

- Having a valid `OPENAI_API_KEY` in your environment variables
- Having access to the O3 model through your OpenAI account

This fallback ensures you can still use the GPT O3 option even without Azure setup, though using Azure is recommended for production environments due to its improved reliability and cost management features.

### Troubleshooting Azure OpenAI Integration

If you experience issues with the Azure OpenAI integration:

1. Verify all environment variables are set correctly
2. Ensure your Azure subscription has access to the OpenAI service
3. Confirm that the O3 model is properly deployed in your Azure OpenAI resource
4. Check the Azure Portal for any quota limitations or service outages
5. Refer to the detailed troubleshooting section in the setup guide 
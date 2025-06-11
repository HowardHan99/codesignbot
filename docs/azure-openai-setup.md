# Azure OpenAI Integration Guide

This document explains how to set up and use Azure OpenAI for accessing the GPT O3 model in the CodesignBot application.

## Prerequisites

1. An Azure account with an active subscription
2. Access to Azure OpenAI Service (requires [application and approval](https://aka.ms/oai/access))
3. Basic familiarity with Azure Portal

## Fallback to Direct OpenAI

If Azure OpenAI is not configured, the system will automatically fall back to using the direct OpenAI API for GPT O3 requests. This requires:

- Having a valid `OPENAI_API_KEY` in your environment variables
- Having access to the O3 model through your OpenAI account

The fallback mechanism checks if all of the following Azure environment variables are present:
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_OPENAI_O3_DEPLOYMENT`

If any of these are missing, it will use the direct OpenAI API instead.

> **Note for Developers:** If you're modifying the code and encounter TypeScript errors with the model parameter in the fallback mechanism, you may need to adjust the OpenAI client configuration or add proper type assertions based on the specific version of the OpenAI SDK you're using. The TypeScript definitions for the OpenAI SDK can be strict about model names.

## Step 1: Create an Azure OpenAI Resource

1. Log into the [Azure Portal](https://portal.azure.com)
2. Click on "Create a resource"
3. Search for "Azure OpenAI"
4. Select "Azure OpenAI" and click "Create"
5. Fill in the required details:
   - Subscription: Select your Azure subscription
   - Resource group: Create a new one or select an existing group
   - Region: Choose a region where Azure OpenAI is available
   - Name: Give your resource a unique name
   - Pricing tier: Select the appropriate tier (usually "Standard S0")
6. Click "Review + create", then "Create"
7. Wait for the deployment to complete (this may take a few minutes)

## Step 2: Deploy the O3 Model

1. Navigate to your newly created Azure OpenAI resource
2. Click on "Go to Azure OpenAI Studio" in the Overview tab
3. In the Azure OpenAI Studio, go to "Deployments" in the left menu
4. Click "Create new deployment"
5. Select the model:
   - Model: `gpt-3.5-turbo` (this is the base model for O3)
   - Model version: Select the latest version
   - Deployment name: **Important** - give it a name (e.g., `gpt-o3-deployment`)
   - Content filter: Standard
6. Click "Create"

## Step 3: Get Connection Details

1. Go back to your Azure OpenAI resource in the Azure Portal
2. Click on "Keys and Endpoint" in the left menu
3. Note down the following:
   - Endpoint: The URL for your Azure OpenAI resource (e.g., `https://your-resource-name.openai.azure.com/`)
   - Key 1 or Key 2: Either key will work as your API key
   - API version: `2023-05-15` or the latest available version

## Step 4: Configure Environment Variables

Add the following environment variables to your project:

```
AZURE_OPENAI_API_KEY=your-azure-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_O3_DEPLOYMENT=o3
```

**Important Notes:**
- **API Version**: O3 model requires API version `2024-12-01-preview` or later
- **Model Name**: Use `o3` as the deployment name, not `gpt-o3` or `GPT_O3`
- **Deployment**: Create a deployment in Azure with the model name `o3` (2025-04-16 version)

**Environment Variables You Need:**
- `AZURE_OPENAI_API_KEY` ✅ (you have this)
- `AZURE_OPENAI_ENDPOINT` ✅ (you have this, make sure no spaces around =)
- `AZURE_OPENAI_API_VERSION` (defaults to `2024-12-01-preview` if not provided)
- `AZURE_OPENAI_O3_DEPLOYMENT` (defaults to `o3` if not provided)

- `AZURE_OPENAI_API_KEY`: The Key 1 or Key 2 from Step 3
- `AZURE_OPENAI_ENDPOINT`: The Endpoint URL from Step 3
- `AZURE_OPENAI_API_VERSION`: The API version from Step 3 (or `2023-05-15` if unsure)
- `AZURE_OPENAI_O3_DEPLOYMENT`: The deployment name you gave in Step 2 (e.g., `gpt-o3-deployment`)

## How It Works in the Project

Our code initializes two OpenAI clients:

1. **Regular OpenAI client**: For direct OpenAI API calls (used for GPT-4)
2. **Azure OpenAI client**: For Azure-hosted models (used for GPT O3)

```javascript
// Regular OpenAI client for direct API access
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Azure OpenAI client for Azure-hosted models
const azureOpenai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments`,
  defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY }
});
```

When making API calls to GPT O3, we use the Azure client with the deployment name:

```javascript
const completion = await azureOpenai.chat.completions.create({
  model: process.env.AZURE_OPENAI_O3_DEPLOYMENT, // The deployment name you created
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ],
  // Other parameters...
});
```

## Troubleshooting

### Common Error Messages

- **401 Unauthorized**: Check your `AZURE_OPENAI_API_KEY` value
- **404 Not Found**: Verify your `AZURE_OPENAI_O3_DEPLOYMENT` name and that the model is actually deployed
- **400 Bad Request**: Check the model parameters (like `max_tokens`) - Azure may have different limits
- **429 Too Many Requests**: You've exceeded your quota limit or rate limit
- **5xx Server Error**: Azure OpenAI service may be experiencing issues

### Quota Limitations

Azure OpenAI has quota limitations that may differ from the direct OpenAI API. You may need to request quota increases through the Azure Portal if you encounter rate limiting.

## Cost Considerations

Azure OpenAI Service is billed based on tokens processed. Make sure to monitor your usage through the Azure Portal to avoid unexpected charges.

## Resources

- [Azure OpenAI Service Documentation](https://learn.microsoft.com/en-us/azure/cognitive-services/openai/)
- [OpenAI Node.js SDK with Azure](https://github.com/openai/openai-node#azure-openai)
- [Azure OpenAI API Reference](https://learn.microsoft.com/en-us/azure/cognitive-services/openai/reference) 
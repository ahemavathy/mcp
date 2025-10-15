# MCP Multi-Feature Server

This project is a Model Context Protocol (MCP) server implemented using Node.js and TypeScript, following the official MCP TypeScript SDK.  
It provides multiple capabilities including weather data, system utilities, Azure integration, and AI-powered image generation and editing.

## Features
- **Current Weather**: Get the current weather for any city
- **Weather Forecast**: Get a 3-day weather forecast for any city
- **City Search**: Find cities by name
- **CLI Commands**: Execute safe, whitelisted CLI commands
- **Directory Listing**: List files and directories
- **System Info**: Get basic system information
- **Azure Integration**: Manage Azure subscriptions and resource groups with MCP elicitation
- **Azure Storage**: Manage Azure Storage blobs and containers
- **Image Generation**: Generate images using AI models (gpt-image-1, flux.1-kontext-pro)
- **Image Editing**: Edit existing images with AI-powered modifications and enhancements

## Getting Started

### Prerequisites
- Node.js v18.x or higher

### Install dependencies
```
npm install
```

### Build the project
```
npx tsc
```

### Run the server (development)
```
npx ts-node src/server.ts
```

### Run the server (compiled)
```
npm run start
```

## Project Structure
- `src/server.ts`: Main MCP server implementation
- `package.json`: Project configuration and dependencies
- `tsconfig.json`: TypeScript configuration

## Sample Prompts

You can use these prompts with an MCP-compatible client or extension:

- **Get current weather**
  - `currentWeather: city = Seattle`
  - `What is the current weather in Paris?`
  - `weather in Phoenix`

- **Get weather forecast**
  - `forecast: city = New York`
  - `weather forecast for Seattle`
  - `3-day forecast for London`

- **Search for a city**
  - `searchCity: query = Washington`
  - `Find cities named "Springfield"`

- **Execute CLI commands**
  - `executeCommand: command = "git status"`
  - `executeCommand: command = "ls -la"`
  - `executeCommand: command = "npm --version"`

- **List directory contents**
  - `listDirectory: path = "."`  
  - `listDirectory: path = "src"`

- **Get system information**
  - `getSystemInfo`

- **Azure subscription management**
  - `listAzureSubscriptions`
  - `getCurrentAzureSubscription`

- **Azure resource groups (with MCP elicitation)**
  - `listAzureResourceGroups` (uses VS Code command palette for subscription selection)

- **Image generation**
  - `generateImages: prompt = "A futuristic cityscape at sunset"`
  - `generateImages: prompt = "A cute robot", model = "flux.1-kontext-pro", size = "512x512", quality = "hd"`
  - `generateImages: prompt = "Mountain landscape", model = "gpt-image-1", n = 2`

- **Image editing**
  - `editImages: prompt = "Add a rainbow in the sky", image = "<base64-data>"`
  - `editImages: prompt = "Change the car color to red", image = "<base64-data>", model = "gpt-image-1"`
  - `editImages: prompt = "Remove the background", image = "<base64-data>", quality = "hd"`

## Image Generation API Requirements

The image generation tools require a running API server at `http://127.0.0.1:8000` with the following endpoints:
- `POST /v1/images/generations` - Generate images from text prompts
- `POST /v1/images/edits` - Edit images with AI modifications

**Supported Models:**
- `gpt-image-1` (Azure OpenAI DALL-E) - Default model
- `flux.1-kontext-pro` (Flux model) - High-quality artistic generation

**Model-Specific Features:**
- **gpt-image-1**: Quality options (standard, hd), supports both generation and editing
- **flux.1-kontext-pro**: Standard quality only, optimized for creative content

**Supported Sizes:** 1024x1024 (default), 512x512, 256x256, and other standard dimensions
**Quality Options:** 
- gpt-image-1: `standard`, `hd`
- flux.1-kontext-pro: `standard`

## MCP Elicitation Features ⭐

This server demonstrates proper implementation of the [MCP Elicitation specification](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation) with VS Code integration:

### `listAzureResourceGroups` Tool
- **Interactive Selection**: When called without a `subscriptionId` parameter, triggers the VS Code MCP extension's command palette
- **Native Integration**: Uses the official MCP elicitation protocol (`elicitation/create` JSON-RPC request)
- **Rich UI**: Shows subscription names with "(ACTIVE)" indicator in the selection dropdown
- **Enum Schema**: Provides structured choices with display names for better UX

**How it works:**
1. Tool is called without `subscriptionId` parameter
2. Server sends `elicitation/create` request to client
3. VS Code MCP extension shows command palette with subscription options
4. User selects subscription from dropdown
5. Tool continues with selected subscription ID

This showcases the proper way to implement interactive, user-driven parameter selection in MCP servers.

## References
- [Model Context Protocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

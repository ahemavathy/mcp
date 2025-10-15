
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import { exec } from "child_process";
import { promisify } from "util";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const execAsync = promisify(exec);

// Create an MCP server
const server = new McpServer({
  name: "demo-server",
  version: "1.0.0"
});


// Helper: Get coordinates for a city using Open-Meteo geocoding
async function getCoordinates(city: string) {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) throw new Error("Failed to fetch coordinates");
  const geoData = await geoRes.json() as any;
  if (!geoData.results || geoData.results.length === 0) throw new Error("City not found");
  const { latitude, longitude, name, country } = geoData.results[0];
  return { latitude, longitude, name, country };
}

// Register a tool to get current weather for a city
server.registerTool(
  "currentWeather",
  {
    title: "Current Weather",
    description: "Get the current weather for a city",
    inputSchema: { city: z.string() }
  },
  async ({ city }) => {
    try {
      const { latitude, longitude, name, country } = await getCoordinates(city);
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
      const weatherRes = await fetch(weatherUrl);
      if (!weatherRes.ok) throw new Error("Failed to fetch weather");
      const weatherData = await weatherRes.json() as any;
      const w = weatherData.current_weather;
      if (!w) throw new Error("No weather data available");
      return {
        content: [{
          type: "text",
          text: `Current weather in ${name}, ${country}: ${w.temperature}°C, wind ${w.windspeed} km/h, code ${w.weathercode}`
        }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Register a tool to get a 3-day forecast for a city
server.registerTool(
  "forecast",
  {
    title: "Weather Forecast",
    description: "Get a 3-day weather forecast for a city",
    inputSchema: { city: z.string() }
  },
  async ({ city }) => {
    try {
      const { latitude, longitude, name, country } = await getCoordinates(city);
      const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&forecast_days=3&timezone=auto`;
      const forecastRes = await fetch(forecastUrl);
      if (!forecastRes.ok) throw new Error("Failed to fetch forecast");
      const forecastData = await forecastRes.json() as any;
      const days = forecastData.daily;
      if (!days || !days.time) throw new Error("No forecast data available");
      let text = `3-day forecast for ${name}, ${country}:\n`;
      for (let i = 0; i < days.time.length; i++) {
        text += `- ${days.time[i]}: ${days.temperature_2m_min[i]}°C - ${days.temperature_2m_max[i]}°C, code ${days.weathercode[i]}\n`;
      }
      return {
        content: [{ type: "text", text }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Register a tool to search for cities by name using Open-Meteo geocoding
server.registerTool(
  "searchCity",
  {
    title: "Search City",
    description: "Find cities matching a query string",
    inputSchema: { query: z.string() }
  },
  async ({ query }) => {
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      if (!geoRes.ok) throw new Error("Failed to fetch city search");
      const geoData = await geoRes.json() as any;
      if (!geoData.results || geoData.results.length === 0) return {
        content: [{ type: "text", text: "No matching cities found." }]
      };
      const matches = geoData.results.map((c: any) => `${c.name}, ${c.country} (${c.latitude},${c.longitude})`).join("\n");
      return {
        content: [{ type: "text", text: `Matching cities:\n${matches}` }]
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Whitelist of allowed commands for security
const ALLOWED_COMMANDS = [
  'ls', 'dir', 'pwd', 'whoami', 'date', 'echo',
  'git status', 'git log --oneline -10', 'git branch',
  'npm --version', 'node --version', 'python --version',
  'systeminfo', 'ps aux', 'df -h', 'free -h'
];

// Helper function to check if command is allowed
function isCommandAllowed(command: string): boolean {
  return ALLOWED_COMMANDS.some(allowed => 
    command.trim().toLowerCase().startsWith(allowed.toLowerCase())
  );
}

// Register a tool to execute safe CLI commands
server.registerTool(
  "executeCommand",
  {
    title: "Execute CLI Command",
    description: "Execute a whitelisted CLI command safely",
    inputSchema: { command: z.string() }
  },
  async ({ command }) => {
    try {
      // Security check
      if (!isCommandAllowed(command)) {
        return {
          content: [{
            type: "text",
            text: `Command '${command}' is not allowed. Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`
          }],
          isError: true
        };
      }

      const { stdout, stderr } = await execAsync(command, { 
        timeout: 10000, // 10 second timeout
        maxBuffer: 1024 * 1024 // 1MB max output
      });
      
      let result = stdout;
      if (stderr) {
        result += `\n[STDERR]: ${stderr}`;
      }
      
      return {
        content: [{
          type: "text",
          text: `Command: ${command}\n\nOutput:\n${result || '(no output)'}`
        }]
      };
    } catch (err: any) {
      return {
        content: [{
          type: "text",
          text: `Command failed: ${err.message}`
        }],
        isError: true
      };
    }
  }
);

// Register a tool to list current directory contents
server.registerTool(
  "listDirectory",
  {
    title: "List Directory",
    description: "List files and directories in the current or specified path",
    inputSchema: { path: z.string().optional() }
  },
  async ({ path }) => {
    try {
      const command = process.platform === 'win32' 
        ? `dir ${path || '.'}`
        : `ls -la ${path || '.'}`;
        
      const { stdout, stderr } = await execAsync(command, {
        timeout: 5000,
        maxBuffer: 512 * 1024
      });
      
      return {
        content: [{
          type: "text",
          text: `Directory listing ${path ? `for ${path}` : ''}:\n\n${stdout}`
        }]
      };
    } catch (err: any) {
      return {
        content: [{
          type: "text",
          text: `Failed to list directory: ${err.message}`
        }],
        isError: true
      };
    }
  }
);

// Register a tool to get system information
server.registerTool(
  "getSystemInfo",
  {
    title: "Get System Information",
    description: "Get basic system information like OS, Node version, etc.",
    inputSchema: {}
  },
  async () => {
    try {
      const info = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cwd: process.cwd(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      };
      
      return {
        content: [{
          type: "text",
          text: `System Information:\n${JSON.stringify(info, null, 2)}`
        }]
      };
    } catch (err: any) {
      return {
        content: [{
          type: "text",
          text: `Failed to get system info: ${err.message}`
        }],
        isError: true
      };
    }
  }
);

// Register a tool to list Azure subscriptions
server.registerTool(
  "listAzureSubscriptions",
  {
    title: "List Azure Subscriptions",
    description: "List all Azure subscriptions available to the current user",
    inputSchema: {}
  },
  async () => {
    try {
      const { stdout, stderr } = await execAsync('az account list --output json', {
        timeout: 30000,
        maxBuffer: 1024 * 1024
      });
      
      if (stderr) {
        return {
          content: [{
            type: "text",
            text: `Azure CLI error: ${stderr}`
          }],
          isError: true
        };
      }
      
      const subscriptions = JSON.parse(stdout);
      
      if (!subscriptions || subscriptions.length === 0) {
        return {
          content: [{
            type: "text",
            text: "❌ No Azure subscriptions found. Please run 'az login' first."
          }],
          isError: true
        };
      }
      
      const currentSubscription = subscriptions.find((sub: any) => sub.isDefault);
      
      let result = `🔍 Azure Subscriptions (${subscriptions.length} found):\n\n`;
      
      subscriptions.forEach((sub: any) => {
        const isActive = sub.isDefault ? "✅ ACTIVE" : "  ";
        const state = sub.state === "Enabled" ? "🟢" : "🔴";
        result += `${isActive} ${state} ${sub.name}\n`;
        result += `    ID: ${sub.id}\n`;
        result += `    State: ${sub.state}\n`;
        result += `    Tenant: ${sub.tenantId}\n\n`;
      });
      
      if (currentSubscription) {
        result += `📌 Current Active Subscription: ${currentSubscription.name}\n`;
        result += `💡 To switch: az account set --subscription "<subscription-id>"\n`;
      }
      
      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (err: any) {
      let errorMessage = `Failed to list Azure subscriptions: ${err.message}`;
      
      if (err.message.includes("az: command not found") || err.message.includes("'az' is not recognized")) {
        errorMessage += "\n\n🔧 Azure CLI is not installed. Please install it from: https://aka.ms/azure-cli";
      } else if (err.message.includes("Please run 'az login'") || err.message.includes("not logged in")) {
        errorMessage += "\n\n🔐 Please authenticate first: az login";
      }
      
      return {
        content: [{
          type: "text",
          text: errorMessage
        }],
        isError: true
      };
    }
  }
);

// Register a tool to get current Azure subscription details
server.registerTool(
  "getCurrentAzureSubscription",
  {
    title: "Get Current Azure Subscription",
    description: "Get details about the currently active Azure subscription",
    inputSchema: {}
  },
  async () => {
    try {
      const { stdout, stderr } = await execAsync('az account show --output json', {
        timeout: 15000,
        maxBuffer: 512 * 1024
      });
      
      if (stderr) {
        return {
          content: [{
            type: "text",
            text: `Azure CLI error: ${stderr}`
          }],
          isError: true
        };
      }
      
      const subscription = JSON.parse(stdout);
      
      const result = `📋 Current Azure Subscription:\n\n` +
        `✅ Name: ${subscription.name}\n` +
        `🆔 ID: ${subscription.id}\n` +
        `🏢 Tenant: ${subscription.tenantId}\n` +
        `👤 User: ${subscription.user?.name || 'N/A'}\n` +
        `🌐 Environment: ${subscription.environmentName}\n` +
        `📊 State: ${subscription.state}\n` +
        `🔄 Default: ${subscription.isDefault ? 'Yes' : 'No'}\n\n` +
        `💡 To change subscription: az account set --subscription "<subscription-id>"`;
      
      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (err: any) {
      let errorMessage = `Failed to get current subscription: ${err.message}`;
      
      if (err.message.includes("az: command not found") || err.message.includes("'az' is not recognized")) {
        errorMessage += "\n\n🔧 Azure CLI is not installed. Please install it from: https://aka.ms/azure-cli";
      } else if (err.message.includes("Please run 'az login'") || err.message.includes("not logged in")) {
        errorMessage += "\n\n🔐 Please authenticate first: az login";
      }
      
      return {
        content: [{
          type: "text",
          text: errorMessage
        }],
        isError: true
      };
    }
  }
);

// Interface for subscription options
interface SubscriptionOption {
  id: string;
  name: string;
  label: string;
  isDefault: boolean;
}

// Helper function to get subscription options for elicitation
async function getSubscriptionOptions(): Promise<SubscriptionOption[]> {
  const { stdout } = await execAsync('az account list --output json', {
    timeout: 30000,
    maxBuffer: 1024 * 1024
  });
  
  const subscriptions = JSON.parse(stdout);
  return subscriptions.map((sub: any): SubscriptionOption => ({
    id: sub.id,
    name: sub.name,
    label: `${sub.name}${sub.isDefault ? ' (ACTIVE)' : ''}`,
    isDefault: sub.isDefault
  }));
}

// Register the resource group tool with proper MCP elicitation
server.registerTool(
  "listAzureResourceGroups",
  {
    title: "List Azure Resource Groups",
    description: "List resource groups in a selected Azure subscription using MCP elicitation",
    inputSchema: {
      subscriptionId: z.string().optional().describe("Azure subscription ID (will be elicited if not provided)")
    }
  },
  async ({ subscriptionId }, context) => {
    try {
      let targetSubscriptionId = subscriptionId;
      
      // If no subscription ID provided, use MCP elicitation to get it
      if (!targetSubscriptionId) {
        try {
          // Get available subscriptions first
          const subscriptionOptions = await getSubscriptionOptions();
          
          if (subscriptionOptions.length === 0) {
            return {
              content: [{
                type: "text",
                text: "❌ No Azure subscriptions found. Please run 'az login' first."
              }],
              isError: true
            };
          }
          
          // Create elicitation request according to MCP spec
          const elicitationRequest = await server.server.elicitInput({
            message: "Please select an Azure subscription to list resource groups from:",
            requestedSchema: {
              type: "object",
              properties: {
                subscriptionId: {
                  type: "string",
                  title: "Azure Subscription",
                  description: "Select the subscription to use",
                  enum: subscriptionOptions.map(sub => sub.id),
                  enumNames: subscriptionOptions.map(sub => sub.label)
                }
              },
              required: ["subscriptionId"]
            }
          });
          
          // Handle elicitation response
          if (elicitationRequest.action === "accept" && elicitationRequest.content?.subscriptionId) {
            targetSubscriptionId = elicitationRequest.content.subscriptionId as string;
          } else if (elicitationRequest.action === "cancel") {
            return {
              content: [{
                type: "text",
                text: "❌ Operation cancelled by user."
              }]
            };
          } else if (elicitationRequest.action === "decline") {
            return {
              content: [{
                type: "text",
                text: "❌ User declined to provide subscription information."
              }]
            };
          } else {
            return {
              content: [{
                type: "text",
                text: "❌ No subscription selected."
              }],
              isError: true
            };
          }
        } catch (elicitationError: any) {
          return {
            content: [{
              type: "text",
              text: `❌ Elicitation failed: ${elicitationError.message}\n\nPlease provide subscriptionId parameter directly.`
            }],
            isError: true
          };
        }
      }
      
      // Now get resource groups using Azure CLI
      const { stdout, stderr } = await execAsync(`az group list --subscription "${targetSubscriptionId}" --output json`, {
        timeout: 30000,
        maxBuffer: 1024 * 1024
      });
      
      if (stderr) {
        return {
          content: [{
            type: "text",
            text: `Azure CLI error: ${stderr}`
          }],
          isError: true
        };
      }
      
      const resourceGroups = JSON.parse(stdout);
      
      if (!resourceGroups || resourceGroups.length === 0) {
        return {
          content: [{
            type: "text",
            text: `📦 No resource groups found in the selected subscription.\n\n💡 Create one at: https://portal.azure.com`
          }]
        };
      }
      
      // Get subscription name for display
      const { stdout: subStdout } = await execAsync(`az account show --subscription "${targetSubscriptionId}" --output json`);
      const subscriptionInfo = JSON.parse(subStdout);
      
      let result = `📦 Resource Groups in "${subscriptionInfo.name}" (${resourceGroups.length} found):\n\n`;
      
      resourceGroups.forEach((rg: any) => {
        const location = rg.location || 'Unknown';
        const state = rg.properties?.provisioningState || 'Unknown';
        const tags = rg.tags ? Object.keys(rg.tags).length : 0;
        
        result += `🏷️  ${rg.name}\n`;
        result += `    📍 Location: ${location}\n`;
        result += `    📊 State: ${state}\n`;
        result += `    🏷️  Tags: ${tags} tag${tags !== 1 ? 's' : ''}\n`;
        if (rg.tags && Object.keys(rg.tags).length > 0) {
          const tagList = Object.entries(rg.tags).map(([k, v]) => `${k}=${v}`).slice(0, 3).join(', ');
          result += `    🔖 ${tagList}${Object.keys(rg.tags).length > 3 ? '...' : ''}\n`;
        }
        result += `\n`;
      });
      
      result += `💡 Subscription: ${subscriptionInfo.name}\n`;
      result += `🆔 Subscription ID: ${targetSubscriptionId}`;
      
      return {
        content: [{
          type: "text",
          text: result
        }]
      };
      
    } catch (err: any) {
      let errorMessage = `Failed to list resource groups: ${err.message}`;
      
      if (err.message.includes("az: command not found") || err.message.includes("'az' is not recognized")) {
        errorMessage += "\n\n🔧 Azure CLI is not installed. Please install it from: https://aka.ms/azure-cli";
      } else if (err.message.includes("Please run 'az login'") || err.message.includes("not logged in")) {
        errorMessage += "\n\n🔐 Please authenticate first: az login";
      } else if (err.message.includes("Subscription") && err.message.includes("not found")) {
        errorMessage += "\n\n🔍 Invalid subscription ID. Use listAzureSubscriptions to see available subscriptions.";
      }
      
      return {
        content: [{
          type: "text",
          text: errorMessage
        }],
        isError: true
      };
    }
  }
);

// Register image generation tool
server.registerTool(
  "generateImages",
  {
    title: "Generate Images",
    description: "Generate Images",
    inputSchema: {
      prompt: z.string().max(4000).describe("Text description of the desired image"),
      model: z.string().default("gpt-image-1").describe("Model to use: flux.1-kontext-pro or gpt-image-1"),
      size: z.string().default("1024x1024").describe("Image size"),
      quality: z.string().optional().describe("Image quality"),
      n: z.number().min(1).max(10).default(1).describe("Number of images to generate")
    }
  },
  async ({ prompt, model, size, quality, n }) => {
    try {
      const requestBody = {
        prompt,
        model: model || "gpt-image-1",
        size: size || "1024x1024",
        quality: quality || "high",
        n: n || 1
      };

      const generateUrl = process.env.GENERATE_IMAGE_API_URL || 'http://127.0.0.1:8000/v1/images/generations';
      const response = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [{
            type: "text",
            text: `❌ Image generation failed: ${response.status} ${response.statusText}\n\nError: ${errorText}`
          }],
          isError: true
        };
      }

      const result = await response.json() as any;
      
      let resultText = `🎨 Successfully generated ${n} image${n > 1 ? 's' : ''}:\n\n`;
      resultText += `📝 Prompt: "${prompt}"\n`;
      resultText += `🤖 Model: ${model}\n`;
      resultText += `📏 Size: ${size}\n`;
      if (quality) resultText += `⭐ Quality: ${quality}\n`;
      resultText += `\n`;
      
      if (result.data && Array.isArray(result.data)) {
        result.data.forEach((image: any, index: number) => {
          if (image.url) {
            resultText += `🖼️ Image ${index + 1}: ${image.url}\n`;
          }
          if (image.b64_json) {
            resultText += `📎 Image ${index + 1}: Base64 data available (${image.b64_json.length} characters)\n`;
          }
        });
      } else {
        resultText += `📋 Response: ${JSON.stringify(result, null, 2)}`;
      }

      return {
        content: [{
          type: "text",
          text: resultText
        }]
      };
    } catch (err: any) {
      return {
        content: [{
          type: "text",
          text: `❌ Failed to generate images: ${err.message}\n\n💡 Make sure the image generation API server is running at ${process.env.GENERATE_IMAGE_API_URL || 'http://127.0.0.1:8000'}`
        }],
        isError: true
      };
    }
  }
);

// Register image editing tool
server.registerTool(
  "editImages",
  {
    title: "Edit Images",
    description: "Edit Images",
    inputSchema: {
      prompt: z.string().max(4000).describe("How to edit the image"),
      image: z.string().describe("Base64-encoded image data"),
      model: z.string().default("gpt-image-1").describe("Model to use for editing"),
      size: z.string().default("1024x1024").describe("Image size"),
      quality: z.string().optional().describe("Image quality"),
      n: z.number().min(1).max(10).default(1).describe("Number of images to generate")
    }
  },
  async ({ prompt, image, model, size, quality, n }) => {
    try {
      const requestBody = {
        prompt,
        image,
        model: model || "gpt-image-1",
        size: size || "1024x1024",
        quality: quality || "high",
        n: n || 1
      };

      const editUrl = process.env.EDIT_IMAGE_API_URL || 'http://127.0.0.1:8000/v1/images/edits';
      const response = await fetch(editUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [{
            type: "text",
            text: `❌ Image editing failed: ${response.status} ${response.statusText}\n\nError: ${errorText}`
          }],
          isError: true
        };
      }

      const result = await response.json() as any;
      
      let resultText = `✏️ Successfully edited ${n} image${n > 1 ? 's' : ''}:\n\n`;
      resultText += `📝 Edit Prompt: "${prompt}"\n`;
      resultText += `🤖 Model: ${model}\n`;
      resultText += `📏 Size: ${size}\n`;
      if (quality) resultText += `⭐ Quality: ${quality}\n`;
      resultText += `🖼️ Original Image: ${image.substring(0, 50)}...\n`;
      resultText += `\n`;
      
      if (result.data && Array.isArray(result.data)) {
        result.data.forEach((image: any, index: number) => {
          if (image.url) {
            resultText += `🎨 Edited Image ${index + 1}: ${image.url}\n`;
          }
          if (image.b64_json) {
            resultText += `📎 Edited Image ${index + 1}: Base64 data available (${image.b64_json.length} characters)\n`;
          }
        });
      } else {
        resultText += `📋 Response: ${JSON.stringify(result, null, 2)}`;
      }

      return {
        content: [{
          type: "text",
          text: resultText
        }]
      };
    } catch (err: any) {
      return {
        content: [{
          type: "text",
          text: `❌ Failed to edit images: ${err.message}\n\n💡 Make sure the image editing API server is running at ${process.env.EDIT_IMAGE_API_URL || 'http://127.0.0.1:8000'}`
        }],
        isError: true
      };
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
server.connect(transport);

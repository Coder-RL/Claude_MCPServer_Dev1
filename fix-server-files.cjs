#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function fixServerFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    let newContent = content;

    // Fix broken registerTool calls from the script
    newContent = newContent.replace(/this\.registerTool\(\{'/g, "this.registerTool({name: '");
    newContent = newContent.replace(/this\.registerTool\(\{name: '([^']+)', \{/g, "this.registerTool({\n      name: '$1',");
    
    // Fix handleToolCall in wrong place (inside interfaces)
    newContent = newContent.replace(/^  async handleToolCall.*?\n  }\n\n}/gms, '}');
    
    // Fix broken constructor comments
    newContent = newContent.replace(/this\.\/\/ setupTools.*?;/g, '// setupTools() will be called automatically');
    
    // Fix broken registerTool with }, async pattern
    newContent = newContent.replace(/this\.registerTool\(\{[^}]+\}\s*\},\s*async\s*\([^)]*\)\s*=>\s*\{[^}]*\}\);/gs, 
      (match) => {
        // Extract tool name and convert to proper format
        const nameMatch = match.match(/name:\s*['"]([^'"]+)['"]/);
        const descMatch = match.match(/description:\s*['"]([^'"]+)['"]/);
        if (nameMatch && descMatch) {
          return `this.registerTool({\n      name: '${nameMatch[1]}',\n      description: '${descMatch[1]}',\n      inputSchema: { type: 'object', properties: {} }\n    });`;
        }
        return match;
      }
    );

    await fs.writeFile(filePath, newContent);
    console.log(`🔧 Fixed syntax in ${filePath}`);
    return true;

  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  const files = [
    'servers/visualization-insights/src/index.ts',
    'servers/ai-integration/src/index.ts', 
    'servers/advanced-ai-capabilities/src/index.ts',
    'servers/inference-enhancement/src/index.ts'
  ];
  
  for (const file of files) {
    await fixServerFile(file);
  }
}

main().catch(console.error);
#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function convertServerToStandardMCP(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    
    // Skip if already converted properly
    if (content.includes('extends StandardMCPServer') && 
        content.includes('async setupTools()') && 
        content.includes('async handleToolCall(')) {
      console.log(`✅ ${filePath} - Already properly converted`);
      return { success: true, skipped: true };
    }

    let newContent = content;

    // Fix remaining import issues
    newContent = newContent.replace(
      /import { StandardMCPServer, MCPTool } from ['"].*shared.*src.*base-server.*['"];?/g,
      "import { StandardMCPServer, MCPTool } from '../../shared/standard-mcp-server';"
    );

    // Add required import
    if (!newContent.includes("import { CallToolResult }")) {
      newContent = newContent.replace(
        "import { StandardMCPServer, MCPTool } from '../../shared/standard-mcp-server';",
        "import { StandardMCPServer, MCPTool } from '../../shared/standard-mcp-server';\nimport { CallToolResult } from '@modelcontextprotocol/sdk/types.js';"
      );
    }

    // Replace old addTool pattern with registerTool
    newContent = newContent.replace(/this\.addTool\(/g, 'this.registerTool({');
    
    // Fix tool registration pattern
    newContent = newContent.replace(
      /this\.registerTool\(\{\s*['"]([^'"]+)['"],\s*\{([^}]+)\}\s*\},\s*async\s*\([^)]*\)\s*=>\s*\{([^}]+)\}\s*\);?/gs,
      (match, toolName, schema, handler) => {
        return `this.registerTool({
      name: '${toolName}',
      description: 'Tool description',
      inputSchema: {${schema}}
    });`;
      }
    );

    // Convert registerMCPTools to setupTools
    newContent = newContent.replace(/private registerMCPTools\(\): void \{/g, 'async setupTools(): Promise<void> {');
    newContent = newContent.replace(/registerMCPTools\(\)/g, '// setupTools() will be called automatically');

    // Remove from constructor
    newContent = newContent.replace(/this\.setupHealthChecks\(\);\s*this\.registerMCPTools\(\);/g, 'this.setupHealthChecks();');
    newContent = newContent.replace(/this\.registerMCPTools\(\);/g, '// setupTools() will be called automatically');

    // Add handleToolCall method if missing
    if (!newContent.includes('async handleToolCall(')) {
      const toolCallMethod = `
  async handleToolCall(toolName: string, parameters: any): Promise<CallToolResult> {
    // Basic implementation - should be customized for each server
    switch (toolName) {
      default:
        throw new Error(\`Unknown tool: \${toolName}\`);
    }
  }`;
      
      // Insert before the last closing brace of the class
      const classEndPattern = /(\s*)\}\s*export/;
      if (classEndPattern.test(newContent)) {
        newContent = newContent.replace(classEndPattern, `${toolCallMethod}\n$1}\n\nexport`);
      } else {
        // Fallback - append before export default
        newContent = newContent.replace(/(export default \w+;?)/, `${toolCallMethod}\n\n$1`);
      }
    }

    await fs.writeFile(filePath, newContent);
    console.log(`🔧 ${filePath} - Converted to StandardMCP format`);
    return { success: true, skipped: false };

  } catch (error) {
    console.error(`❌ ${filePath} - Error:`, error.message);
    return { success: false, error: error.message };
  }
}

async function findServerFiles() {
  const serverDirs = await fs.readdir('servers', { withFileTypes: true });
  const serverFiles = [];
  
  for (const dir of serverDirs) {
    if (dir.isDirectory()) {
      const srcPath = path.join('servers', dir.name, 'src');
      try {
        const srcFiles = await fs.readdir(srcPath);
        for (const file of srcFiles) {
          if (file.endsWith('.ts') && (file.includes('index') || file.includes('server'))) {
            serverFiles.push(path.join(srcPath, file));
          }
        }
      } catch (err) {
        // Skip if src directory doesn't exist
      }
    }
  }
  
  return serverFiles;
}

async function main() {
  console.log('🔄 Converting remaining servers to StandardMCP format...\n');
  
  const serverFiles = await findServerFiles();
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const file of serverFiles) {
    const result = await convertServerToStandardMCP(file);
    if (result.success) {
      if (result.skipped) {
        skipped++;
      } else {
        converted++;
      }
    } else {
      failed++;
    }
  }
  
  console.log(`\n📊 Conversion Summary:`);
  console.log(`   Converted: ${converted}`);
  console.log(`   Already done: ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total files: ${serverFiles.length}`);
}

main().catch(console.error);
#!/bin/bash

# Batch MCP Server Conversion Script
# Converts all remaining BaseMCPServer servers to StandardMCPServer

set -e

PROJECT_ROOT="/Users/robertlee/GitHubProjects/Claude_MCPServer"
LOG_FILE="$PROJECT_ROOT/conversion.log"

echo "🔄 Starting batch MCP server conversion..." | tee "$LOG_FILE"

# List of servers to convert (excluding already converted ones)
declare -a SERVERS=(
    # Advanced AI Capabilities
    "servers/advanced-ai-capabilities/src/hyperparameter-tuner.ts"
    "servers/advanced-ai-capabilities/src/loss-function-manager.ts"
    "servers/advanced-ai-capabilities/src/activation-function-optimizer.ts"
    "servers/advanced-ai-capabilities/src/neural-network-controller.ts"
    "servers/advanced-ai-capabilities/src/gradient-optimizer.ts"
    "servers/advanced-ai-capabilities/src/index.ts"
    
    # Transformer Architecture
    "servers/transformer-architecture/src/multi-head-attention.ts"
    "servers/transformer-architecture/src/transformer-block-manager.ts"
    "servers/transformer-architecture/src/positional-encoding-service.ts"
    "servers/transformer-architecture/src/fine-tuning-optimization-engine.ts"
    "servers/transformer-architecture/src/transformer-model-factory.ts"
    
    # Attention Mechanisms
    "servers/attention-mechanisms/src/sparse-attention-engine.ts"
    "servers/attention-mechanisms/src/cross-attention-controller.ts"
    "servers/attention-mechanisms/src/attention-visualization-engine.ts"
    "servers/attention-mechanisms/src/attention-pattern-analyzer.ts"
    "servers/attention-mechanisms/src/memory-efficient-attention.ts"
    
    # Language Model
    "servers/language-model/src/inference-pipeline-manager.ts"
    "servers/language-model/src/model-benchmarking-suite.ts"
    "servers/language-model/src/language-model-interface.ts"
    "servers/language-model/src/model-integration-hub.ts"
    
    # Other servers
    "servers/visualization-insights/src/index.ts"
    "servers/ai-integration/src/index.ts"
    "servers/inference-enhancement/src/index.ts"
)

convert_server() {
    local server_path="$1"
    local server_name=$(basename "$server_path" .ts)
    local dir_name=$(dirname "$server_path")
    
    echo "Converting: $server_path" | tee -a "$LOG_FILE"
    
    # Check if file exists
    if [[ ! -f "$PROJECT_ROOT/$server_path" ]]; then
        echo "  ❌ File not found: $server_path" | tee -a "$LOG_FILE"
        return 1
    fi
    
    # Check if already converted
    if grep -q "StandardMCPServer" "$PROJECT_ROOT/$server_path"; then
        echo "  ✅ Already converted: $server_path" | tee -a "$LOG_FILE"
        return 0
    fi
    
    # Create backup
    cp "$PROJECT_ROOT/$server_path" "$PROJECT_ROOT/$server_path.backup"
    
    # Basic conversion patterns
    sed -i '' 's/import { BaseMCPServer }/import { StandardMCPServer, MCPTool }/g' "$PROJECT_ROOT/$server_path"
    sed -i '' 's/extends BaseMCPServer/extends StandardMCPServer/g' "$PROJECT_ROOT/$server_path"
    sed -i '' 's/async callTool(/async handleToolCall(/g' "$PROJECT_ROOT/$server_path"
    sed -i '' 's/Promise<any>/Promise<{ content: { type: string; text: string }[] }>/g' "$PROJECT_ROOT/$server_path"
    sed -i '' 's/throw new MCPError/throw new Error/g' "$PROJECT_ROOT/$server_path"
    
    # Remove NODE_OPTIONS modifications
    sed -i '' '/process\.env\.NODE_OPTIONS/d' "$PROJECT_ROOT/$server_path"
    
    echo "  ✅ Basic conversion applied: $server_path" | tee -a "$LOG_FILE"
    
    # Test compilation
    if timeout 5 npx tsx "$PROJECT_ROOT/$server_path" </dev/null &>/dev/null; then
        echo "  ✅ Compilation test passed: $server_path" | tee -a "$LOG_FILE"
        return 0
    else
        echo "  ⚠️ Compilation test failed, needs manual fix: $server_path" | tee -a "$LOG_FILE"
        return 1
    fi
}

# Convert all servers
total_servers=${#SERVERS[@]}
converted_count=0
failed_count=0

echo "Found $total_servers servers to convert" | tee -a "$LOG_FILE"

for server in "${SERVERS[@]}"; do
    if convert_server "$server"; then
        ((converted_count++))
    else
        ((failed_count++))
    fi
done

echo "🎯 Conversion Summary:" | tee -a "$LOG_FILE"
echo "  Total servers: $total_servers" | tee -a "$LOG_FILE"
echo "  Converted: $converted_count" | tee -a "$LOG_FILE"
echo "  Failed: $failed_count" | tee -a "$LOG_FILE"
echo "  Success rate: $(( converted_count * 100 / total_servers ))%" | tee -a "$LOG_FILE"

if [[ $failed_count -eq 0 ]]; then
    echo "🎉 All servers converted successfully!" | tee -a "$LOG_FILE"
else
    echo "⚠️ Some servers need manual attention" | tee -a "$LOG_FILE"
fi
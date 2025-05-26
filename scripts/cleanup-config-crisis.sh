#!/bin/bash

# Configuration Crisis Cleanup Script
# Removes memory-simple-user references from all project files
# Run from project root: ./scripts/cleanup-config-crisis.sh

set -e  # Exit on any error

echo "🚨 Configuration Crisis Cleanup Script"
echo "======================================"
echo ""

# Backup first
echo "📋 Step 1: Creating backups..."
BACKUP_DIR="config-crisis-backup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# List of files to clean (found during investigation)
FILES_TO_CLEAN=(
    "mcp_config.json"
    "config/claude-code/claude_code_config_absolute.json"
    "config/claude-code/claude_code_config_wrapper.json"
    "config/claude-code/claude_code_config_fixed.json"
    "config/claude-code/claude_code_config_backup.json"
    "config/claude-code/claude_code_config_simple.json"
    "config/claude-code/claude_code_config.json"
    "config/claude-code/claude_code_config_minimal.json"
    "config/claude-desktop/claude_desktop_config.json"
    ".claude/claude_desktop_config.json"
    ".claude/settings.local.json"
    "mcp_test_results.json"
    "Support/Claude/claude_desktop_config.json"
)

# Create backups
for file in "${FILES_TO_CLEAN[@]}"; do
    if [ -f "$file" ]; then
        echo "  📁 Backing up: $file"
        cp "$file" "$BACKUP_DIR/"
    else
        echo "  ⚠️  File not found (okay): $file"
    fi
done

echo ""
echo "✅ Backups created in: $BACKUP_DIR"
echo ""

# Show current MCP status
echo "📊 Step 2: Current MCP status (BEFORE cleanup):"
echo "Expected to see memory-simple-user in the list:"
mcp || echo "  ⚠️  mcp command failed - that's part of the problem"
echo ""

# Clean each file
echo "🧹 Step 3: Cleaning files..."
echo ""

CLEANED_COUNT=0

for file in "${FILES_TO_CLEAN[@]}"; do
    if [ -f "$file" ]; then
        echo "  🔍 Processing: $file"
        
        # Check if file contains memory-simple references
        if grep -q "memory-simple" "$file" 2>/dev/null; then
            echo "    ❌ Found memory-simple references - cleaning..."
            
            # Different cleaning strategies based on file type
            if [[ "$file" == *.json ]]; then
                # For JSON files, remove the entire memory-simple-user server block
                # This is a safe approach - remove the problematic server entirely
                
                # Create temp file without memory-simple references
                python3 -c "
import json
import sys

try:
    with open('$file', 'r') as f:
        data = json.load(f)
    
    # Remove memory-simple servers from mcpServers if it exists
    if 'mcpServers' in data:
        servers_to_remove = [k for k in data['mcpServers'].keys() if 'memory-simple' in k]
        for server in servers_to_remove:
            print(f'      Removing server: {server}')
            del data['mcpServers'][server]
    
    # Write cleaned version
    with open('$file', 'w') as f:
        json.dump(data, f, indent=2)
    
    print('    ✅ Cleaned successfully')
    
except Exception as e:
    print(f'    ⚠️  Could not parse as JSON: {e}')
    # Fallback to sed for non-JSON or corrupted files
    import subprocess
    subprocess.run(['sed', '-i', '', '/memory-simple/d', '$file'])
    print('    ✅ Applied fallback text cleaning')
"
            else
                # For non-JSON files, just remove lines containing memory-simple
                sed -i '' '/memory-simple/d' "$file"
                echo "    ✅ Cleaned with text removal"
            fi
            
            CLEANED_COUNT=$((CLEANED_COUNT + 1))
        else
            echo "    ✅ No memory-simple references found"
        fi
    else
        echo "  ⚠️  File not found: $file"
    fi
    echo ""
done

# Verification
echo "🔍 Step 4: Verification"
echo "======================"
echo ""

echo "📊 New MCP status (AFTER cleanup):"
echo "Should NOT contain memory-simple-user:"
mcp || echo "  ⚠️  mcp command still failing - may need Claude Code restart"
echo ""

echo "📋 Claude MCP servers (user-scoped):"
claude mcp list || echo "  ⚠️  claude mcp list failed"
echo ""

# Final verification
echo "🎯 Step 5: Final verification"
echo "============================="
echo ""

echo "Searching for any remaining memory-simple references..."
REMAINING=$(find . -name "*.json" -not -path "./node_modules/*" -not -path "./$BACKUP_DIR/*" | xargs grep -l "memory-simple" 2>/dev/null | wc -l)

if [ "$REMAINING" -eq 0 ]; then
    echo "✅ SUCCESS: No memory-simple references found in project files"
else
    echo "❌ WARNING: Still found memory-simple references in $REMAINING files:"
    find . -name "*.json" -not -path "./node_modules/*" -not -path "./$BACKUP_DIR/*" | xargs grep -l "memory-simple" 2>/dev/null
fi

echo ""
echo "📈 Summary:"
echo "==========="
echo "  Files cleaned: $CLEANED_COUNT"
echo "  Backup location: $BACKUP_DIR"
echo "  Files with remaining references: $REMAINING"
echo ""

if [ "$REMAINING" -eq 0 ]; then
    echo "🎉 CLEANUP COMPLETE!"
    echo ""
    echo "Next steps:"
    echo "1. Restart Claude Code: claude"
    echo "2. Verify MCP status: mcp"
    echo "3. Expected servers: data-governance, data-pipeline, filesystem-standard, memory-enhanced, sequential-thinking"
    echo "4. memory-simple-user should NOT appear"
else
    echo "⚠️  CLEANUP INCOMPLETE - manual intervention needed"
    echo "Check the files listed above and remove memory-simple references manually"
fi

echo ""
echo "To rollback if needed:"
echo "  cp $BACKUP_DIR/* ./"
echo "  (then restore each file to its original location)"
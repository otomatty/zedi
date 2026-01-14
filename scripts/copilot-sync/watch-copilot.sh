#!/bin/bash
# Watch GitHub Copilot chat sessions and sync to Zedi
# Based on: https://zenn.dev/pepabo/articles/ffb79b5279f6ee

set -euo pipefail

# Configuration
ZEDI_OUTPUT_DIR="${ZEDI_OUTPUT_DIR:-$HOME/zedi-copilot-logs}"
COPILOT_SESSION_DIR="$HOME/Library/Application Support/Code/User/workspaceStorage"
LAST_SYNCED_FILE="$HOME/.copilot-zedi-last-synced"
POLL_INTERVAL="${POLL_INTERVAL:-5}"  # seconds

# Create output directory if it doesn't exist
mkdir -p "$ZEDI_OUTPUT_DIR"

# Initialize last synced state file
init_state() {
    if [ ! -f "$LAST_SYNCED_FILE" ]; then
        echo "{}" > "$LAST_SYNCED_FILE"
    fi
}

# Get the last synced timestamp for a session file
get_last_synced() {
    local session_file="$1"
    local hash=$(echo -n "$session_file" | md5)
    jq -r ".\"$hash\" // \"0\"" "$LAST_SYNCED_FILE" 2>/dev/null || echo "0"
}

# Update the last synced timestamp for a session file
update_last_synced() {
    local session_file="$1"
    local timestamp="$2"
    local hash=$(echo -n "$session_file" | md5)
    local temp_file=$(mktemp)
    jq ".\"$hash\" = \"$timestamp\"" "$LAST_SYNCED_FILE" > "$temp_file" 2>/dev/null || echo "{\"$hash\": \"$timestamp\"}" > "$temp_file"
    mv "$temp_file" "$LAST_SYNCED_FILE"
}

# Find all recent Copilot chat session files
find_session_files() {
    local time_filter="${1:--mmin -60}"  # Default: last 60 minutes
    find "$COPILOT_SESSION_DIR" \
        -name "*.json" \
        -path "*/chatSessions/*" \
        $time_filter \
        2>/dev/null || true
}

# Find all Copilot chat session files (no time filter)
find_all_session_files() {
    find "$COPILOT_SESSION_DIR" \
        -name "*.json" \
        -path "*/chatSessions/*" \
        2>/dev/null || true
}

# Extract workspace name from session path
get_workspace_name() {
    local session_file="$1"
    local workspace_hash=$(echo "$session_file" | grep -oE '[a-f0-9]{32}' | head -1)

    # Try to find workspace.json in the same directory structure
    local workspace_dir=$(dirname "$(dirname "$session_file")")
    local workspace_json="$workspace_dir/workspace.json"

    if [ -f "$workspace_json" ]; then
        local folder=$(jq -r '.folder // empty' "$workspace_json" 2>/dev/null)
        if [ -n "$folder" ]; then
            basename "$folder" 2>/dev/null || echo "$workspace_hash"
            return
        fi
    fi

    echo "$workspace_hash"
}

# Convert Copilot chat session JSON to Markdown
convert_to_markdown() {
    local session_file="$1"
    local workspace_name="$2"
    local today=$(date +%Y年%-m月%-d日)

    jq -r --arg workspace "$workspace_name" --arg today "$today" '
    def extract_text:
        if type == "string" then .
        elif type == "array" then
            map(
                if type == "object" then
                    if .text then .text
                    elif .value then .value
                    else empty
                    end
                elif type == "string" then .
                else empty
                end
            ) | join("")
        elif type == "object" then
            if .text then .text
            elif .value then .value
            else empty
            end
        else empty
        end;

    def clean_text:
        gsub("\n\n\n+"; "\n\n") |
        gsub("^\\s+|\\s+$"; "");

    "# \($today) GitHub Copilot との会話\n\n## プロジェクト: \($workspace)\n\n---\n\n" +
    (
        .requests // [] |
        map(
            (
                (.message.text // (.message.parts | map(.text // empty) | join(""))) as $user_msg |
                (.response | map(
                    if type == "object" then
                        if .value then .value
                        elif .text then .text
                        else empty
                        end
                    elif type == "string" then .
                    else empty
                    end
                ) | join("")) as $assistant_msg |

                if ($user_msg | length) > 0 then
                    "### 💬 ユーザー\n\n" + ($user_msg | clean_text) + "\n\n" +
                    "### 🤖 GitHub Copilot\n\n" + ($assistant_msg | clean_text) + "\n\n---\n\n"
                else empty
                end
            )
        ) | join("")
    )
    ' "$session_file" 2>/dev/null
}

# Sync a single session file
sync_session() {
    local session_file="$1"

    # Check if file was modified since last sync
    local file_mtime=$(stat -f %m "$session_file" 2>/dev/null || echo "0")
    local last_synced=$(get_last_synced "$session_file")

    if [ "$file_mtime" = "$last_synced" ]; then
        return 0
    fi

    # Validate JSON
    if ! jq empty "$session_file" 2>/dev/null; then
        echo "Warning: Invalid JSON in $session_file"
        return 1
    fi

    local workspace_name=$(get_workspace_name "$session_file")
    local today=$(date +%Y-%m-%d)
    local session_id=$(basename "$session_file" .json)
    local output_file="$ZEDI_OUTPUT_DIR/${today}_${workspace_name}_${session_id}.md"

    echo "Syncing: $session_file -> $output_file"

    # Convert and save
    local content=$(convert_to_markdown "$session_file" "$workspace_name")

    if [ -n "$content" ] && [ ${#content} -gt 100 ]; then
        echo "$content" > "$output_file"
        update_last_synced "$session_file" "$file_mtime"
        echo "Synced successfully: $output_file"
    else
        echo "No meaningful content to sync"
    fi
}

# Main watch loop
watch_loop() {
    echo "==================================================="
    echo "GitHub Copilot → Zedi Sync Service"
    echo "==================================================="
    echo "Watching: $COPILOT_SESSION_DIR"
    echo "Output:   $ZEDI_OUTPUT_DIR"
    echo "Interval: ${POLL_INTERVAL}s"
    echo "==================================================="
    echo ""
    echo "Press Ctrl+C to stop"
    echo ""

    init_state

    while true; do
        local session_files=$(find_session_files)

        if [ -n "$session_files" ]; then
            echo "$session_files" | while read -r session_file; do
                if [ -n "$session_file" ] && [ -f "$session_file" ]; then
                    sync_session "$session_file" || true
                fi
            done
        fi

        sleep "$POLL_INTERVAL"
    done
}

# One-time sync command
sync_once() {
    echo "Running one-time sync..."
    init_state

    local session_files=$(find_session_files)
    local count=0

    if [ -n "$session_files" ]; then
        echo "$session_files" | while read -r session_file; do
            if [ -n "$session_file" ] && [ -f "$session_file" ]; then
                sync_session "$session_file" || true
                count=$((count + 1))
            fi
        done
    fi

    echo "Sync complete. Processed sessions from last 60 minutes."
}

# Sync all sessions (no time filter)
sync_all() {
    echo "Running full sync of all sessions..."
    init_state

    local session_files=$(find_all_session_files)
    local count=0

    if [ -n "$session_files" ]; then
        echo "$session_files" | while read -r session_file; do
            if [ -n "$session_file" ] && [ -f "$session_file" ]; then
                sync_session "$session_file" || true
                count=$((count + 1))
            fi
        done
    fi

    echo "Full sync complete. Processed all available sessions."
}

# Show usage
usage() {
    cat << EOF
Usage: $(basename "$0") [command]

Commands:
  watch     Start watching for new Copilot chat sessions (default)
  sync      Run a one-time sync of recent sessions (last 60 minutes)
  sync-all  Sync all available sessions (ignores time filter)
  help      Show this help message

Environment Variables:
  ZEDI_OUTPUT_DIR   Output directory for markdown files (default: ~/zedi-copilot-logs)
  POLL_INTERVAL     Seconds between checks (default: 5)

Examples:
  $(basename "$0")                    # Start watching
  $(basename "$0") watch              # Start watching
  $(basename "$0") sync               # One-time sync (recent)
  $(basename "$0") sync-all           # Sync all sessions
  POLL_INTERVAL=10 $(basename "$0")   # Watch with 10s interval

EOF
}

# Main entry point
main() {
    local command="${1:-watch}"

    case "$command" in
        watch)
            watch_loop
            ;;
        sync)
            sync_once
            ;;
        sync-all)
            sync_all
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            echo "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"

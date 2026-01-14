#!/bin/bash
# Setup script for GitHub Copilot → Zedi sync service
# This script installs the watch-copilot.sh script and LaunchAgent

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.zedi/scripts"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/.zedi/logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

echo_success() {
    echo -e "${GREEN}✓${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check for required tools
check_dependencies() {
    echo_info "Checking dependencies..."

    if ! command -v jq &> /dev/null; then
        echo_error "jq is required but not installed."
        echo_info "Install with: brew install jq"
        exit 1
    fi
    echo_success "jq is installed"

    # Check if VS Code is installed
    if [ ! -d "$HOME/Library/Application Support/Code" ]; then
        echo_warning "VS Code user data directory not found."
        echo_warning "Make sure VS Code is installed and has been run at least once."
    else
        echo_success "VS Code data directory found"
    fi

    # Check for GitHub Copilot chat sessions
    local session_count=$(find "$HOME/Library/Application Support/Code/User/workspaceStorage" \
        -name "*.json" -path "*/chatSessions/*" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$session_count" -gt 0 ]; then
        echo_success "Found $session_count existing Copilot chat session(s)"
    else
        echo_warning "No Copilot chat sessions found yet. That's OK - they'll be synced when created."
    fi
}

# Create necessary directories
create_directories() {
    echo_info "Creating directories..."

    mkdir -p "$INSTALL_DIR"
    echo_success "Created $INSTALL_DIR"

    mkdir -p "$LOG_DIR"
    echo_success "Created $LOG_DIR"

    mkdir -p "$HOME/zedi-copilot-logs"
    echo_success "Created $HOME/zedi-copilot-logs"
}

# Install the watch script
install_script() {
    echo_info "Installing watch-copilot.sh..."

    cp "$SCRIPT_DIR/watch-copilot.sh" "$INSTALL_DIR/watch-copilot.sh"
    chmod +x "$INSTALL_DIR/watch-copilot.sh"

    echo_success "Installed to $INSTALL_DIR/watch-copilot.sh"
}

# Install LaunchAgent
install_launch_agent() {
    echo_info "Installing LaunchAgent..."

    # Create LaunchAgents directory if it doesn't exist
    mkdir -p "$LAUNCH_AGENTS_DIR"

    # Copy and modify plist
    local plist_file="$LAUNCH_AGENTS_DIR/com.zedi.copilot-sync.plist"

    # Replace ~ with actual home path in plist
    sed "s|\$HOME|$HOME|g; s|~/|$HOME/|g" "$SCRIPT_DIR/com.zedi.copilot-sync.plist" > "$plist_file"

    echo_success "Installed LaunchAgent to $plist_file"
}

# Load the LaunchAgent
load_launch_agent() {
    echo_info "Loading LaunchAgent..."

    local plist_file="$LAUNCH_AGENTS_DIR/com.zedi.copilot-sync.plist"

    # Unload if already loaded (ignore errors)
    launchctl unload "$plist_file" 2>/dev/null || true

    # Load the agent
    launchctl load "$plist_file"

    echo_success "LaunchAgent loaded and running"
}

# Verify installation
verify_installation() {
    echo_info "Verifying installation..."

    # Check if script exists and is executable
    if [ -x "$INSTALL_DIR/watch-copilot.sh" ]; then
        echo_success "Script is installed and executable"
    else
        echo_error "Script installation failed"
        exit 1
    fi

    # Check if LaunchAgent is loaded
    if launchctl list | grep -q "com.zedi.copilot-sync"; then
        echo_success "LaunchAgent is running"
    else
        echo_warning "LaunchAgent might not be running. Check logs for errors."
    fi
}

# Show status and usage info
show_status() {
    echo ""
    echo "=============================================="
    echo -e "${GREEN}Installation complete!${NC}"
    echo "=============================================="
    echo ""
    echo "Configuration:"
    echo "  Script:     $INSTALL_DIR/watch-copilot.sh"
    echo "  Output:     $HOME/zedi-copilot-logs/"
    echo "  Logs:       /tmp/zedi-copilot-sync.log"
    echo "  Errors:     /tmp/zedi-copilot-sync-error.log"
    echo ""
    echo "Commands:"
    echo "  View logs:        tail -f /tmp/zedi-copilot-sync.log"
    echo "  Manual sync:      $INSTALL_DIR/watch-copilot.sh sync"
    echo "  Stop service:     launchctl unload ~/Library/LaunchAgents/com.zedi.copilot-sync.plist"
    echo "  Start service:    launchctl load ~/Library/LaunchAgents/com.zedi.copilot-sync.plist"
    echo "  Uninstall:        $SCRIPT_DIR/setup.sh uninstall"
    echo ""
    echo "The service is now running in the background and will automatically"
    echo "sync your GitHub Copilot conversations to Markdown files."
    echo ""
}

# Uninstall the service
uninstall() {
    echo_info "Uninstalling Copilot sync service..."

    local plist_file="$LAUNCH_AGENTS_DIR/com.zedi.copilot-sync.plist"

    # Unload LaunchAgent
    if [ -f "$plist_file" ]; then
        launchctl unload "$plist_file" 2>/dev/null || true
        rm "$plist_file"
        echo_success "Removed LaunchAgent"
    fi

    # Remove script
    if [ -f "$INSTALL_DIR/watch-copilot.sh" ]; then
        rm "$INSTALL_DIR/watch-copilot.sh"
        echo_success "Removed watch script"
    fi

    # Ask about removing logs and output
    echo ""
    echo_warning "The following directories were NOT removed:"
    echo "  - $HOME/zedi-copilot-logs/ (synced markdown files)"
    echo "  - $LOG_DIR/ (log directory)"
    echo ""
    echo "Remove them manually if desired."
    echo ""
    echo_success "Uninstall complete"
}

# Main
main() {
    echo ""
    echo "=============================================="
    echo "GitHub Copilot → Zedi Sync Service Setup"
    echo "=============================================="
    echo ""

    local command="${1:-install}"

    case "$command" in
        install)
            check_dependencies
            create_directories
            install_script
            install_launch_agent
            load_launch_agent
            verify_installation
            show_status
            ;;
        uninstall)
            uninstall
            ;;
        *)
            echo "Usage: $0 [install|uninstall]"
            exit 1
            ;;
    esac
}

main "$@"

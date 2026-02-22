#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "==============================="
echo "  Zedi Development Setup"
echo "==============================="
echo ""

# Check Bun
if command -v bun &> /dev/null; then
  BUN_VERSION=$(bun --version)
  info "Bun ${BUN_VERSION} detected"
else
  error "Bun is not installed. Please install from https://bun.sh/"
  exit 1
fi

# Check Node.js (optional, for some tools)
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  info "Node.js ${NODE_VERSION} detected"
else
  warn "Node.js is not installed. Some tools may not work without it."
fi

# Check Git
if command -v git &> /dev/null; then
  GIT_VERSION=$(git --version)
  info "${GIT_VERSION} detected"
else
  error "Git is not installed."
  exit 1
fi

echo ""
info "Installing dependencies..."
bun install

echo ""
info "Setting up Git hooks (husky)..."
bunx husky

echo ""
if [ ! -f .env.local ] && [ ! -f .env.development ]; then
  info "Creating .env.local from .env.example..."
  cp .env.example .env.local
  warn "Please update .env.local with your actual credentials."
  warn "The app works without external services (local SQLite mode)."
else
  info ".env file already exists, skipping."
fi

echo ""
info "Verifying setup..."

echo -n "  Lint:   "
if bun run lint --quiet 2>/dev/null; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${YELLOW}warnings found (non-blocking)${NC}"
fi

echo -n "  Build:  "
if bun run build 2>/dev/null 1>/dev/null; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAILED${NC}"
  error "Build failed. Please check for errors."
  exit 1
fi

echo ""
echo "==============================="
echo -e "  ${GREEN}Setup complete!${NC}"
echo "==============================="
echo ""
echo "  Quick start:"
echo "    bun run dev          Start dev server (http://localhost:30000)"
echo "    bun run test         Run unit tests"
echo "    bun run lint         Run linter"
echo "    bun run format       Format code"
echo ""
echo "  See CONTRIBUTING.md for development guidelines."
echo ""

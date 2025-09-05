# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HubMark is a cross-browser bookmarking extension that syncs bookmarks to a GitHub repository.

### Requirements
- Chrome and Safari extension compatibility
- User has a GitHub account
- Extension setup assists in creating/selecting a GitHub repository
- Bookmarks saved in structured Markdown files for easy sharing
- Real-time sync on bookmark save, delete, or edit operations

### Core Features
- Sync bookmarks to a user-owned GitHub repository
- Store bookmarks in Markdown format for web sharing
- GitHub repository setup assistance
- Support for existing repository selection

## Technology Stack
- WXT framework for cross-browser extension development
- React + TypeScript for UI components
- GitHub API integration for repository operations

## Development Guidelines

### Version Control
- **Semantic Versioning**: Follow [semver.org](https://semver.org/) for version numbering (MAJOR.MINOR.PATCH)
- **Conventional Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages

#### Commit Message Format:
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Examples:**
- `feat: add GitHub authentication flow`
- `fix: resolve bookmark sync race condition`  
- `docs: update installation instructions`
- `chore: update dependencies`
- `test: add unit tests for bookmark manager`
- `refactor: simplify sync engine logic`

## Architecture

Following WXT's flat folder structure conventions:

```
📂 hubmarks/
   📁 .output/           # Build artifacts
   📁 .wxt/              # Generated TS config
   📁 assets/            # CSS, images, processed assets
   📁 components/        # Auto-imported React UI components
   📁 entrypoints/       # Extension entry points (popup, options, background)
   📁 hooks/             # Auto-imported React hooks
   📁 public/            # Static files copied as-is
   📁 utils/             # Auto-imported utility functions
   📄 wxt.config.ts      # Main WXT configuration
```

### Key Directories:
- **`entrypoints/`**: Contains popup, options, and background entry points
- **`components/`**: Reusable React components (auto-imported)
- **`hooks/`**: React hooks for state management and logic (auto-imported)
- **`utils/`**: GitHub API, bookmark management, sync logic (auto-imported)
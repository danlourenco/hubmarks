# HubMark - Cross-Browser Bookmark Sync Extension

A powerful cross-browser extension that synchronizes your bookmarks to GitHub repositories using a JSON-first architecture.

## Features

- 📚 **Cross-browser compatibility** - Works in Chrome, Firefox, Safari, and Edge
- 🔄 **GitHub sync** - Sync bookmarks to your own GitHub repository
- 📊 **JSON-first architecture** - Structured data with auto-generated Markdown display
- 🏷️ **Rich metadata** - Tags, notes, folders, favorites, and archiving
- 🔧 **Real-time sync** - Automatic synchronization on bookmark changes
- 🎨 **Clean UI** - Modern interface built with Tailwind CSS and DaisyUI

## Architecture

### JSON-First Storage

- **Source of Truth**: `bookmarks/data.json` contains structured bookmark data
- **Display Files**: Auto-generated `README.md` for human-readable viewing
- **Rich Metadata**: Full support for tags, notes, folders, favorites, and archiving
- **Stable IDs**: Content-based IDs ensure consistent sync across devices

### Technology Stack

- **WXT Framework** - Cross-browser extension development
- **React + TypeScript** - Modern UI components
- **Tailwind CSS + DaisyUI** - Professional styling system
- **GitHub API** - Repository integration and sync
- **Web Crypto API** - Browser-safe cryptographic operations

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Extension Setup

1. Install the extension in your browser
2. Configure GitHub repository settings
3. Authenticate with your GitHub account
4. Start syncing your bookmarks!

## Documentation

- [JSON Architecture](./docs/json-architecture.md) - Detailed architecture overview
- [Data Flow](./docs/data-flow.md) - How data moves through the system
- [API Reference](./docs/api-reference.md) - Complete API documentation
- [Testing](./docs/testing.md) - Testing strategies and guidelines

## License

MIT License - see LICENSE file for details

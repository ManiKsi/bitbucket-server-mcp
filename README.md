# Bitbucket Server MCP

A professional Model Context Protocol (MCP) server for Bitbucket Server, enabling seamless automation and integration for pull request management, code review, and repository operations.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [MCP Server Configuration](#mcp-server-configuration)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**Bitbucket Server MCP** provides a robust interface for automating and managing Bitbucket Server repositories and pull requests via the Model Context Protocol. Designed for enterprise environments, it supports advanced workflows, large diffs, and seamless integration with MCP clients.

---

## Features

- List repositories, branches, and pull requests
- Create, update, and merge pull requests (merge-commit, squash, fast-forward)
- Decline and delete pull requests
- Add comments and inline code suggestions
- Retrieve pull request diffs and review status
- Efficient handling of large pull request diffs
- Extensible tool handler wiring for MCP protocol
- Cross-platform support (Windows, Mac, Linux)

---

## Installation

### Using npx (Recommended)

Run directly without cloning:

```sh
npx -y bitbucket-server-mcp
```

### Local Installation

Clone and build the project:

```sh
git clone https://github.com/your-org/bitbucket-server-mcp.git
cd bitbucket-server-mcp
npm install
npm run build
```

---

## Quick Start

1. Copy `.env.example` to `.env` and configure your Bitbucket Server credentials.
2. Start the MCP server:

   ```sh
   npm start
   # or
   node build/index.js
   ```

---

## 🚀 MCP Server Configuration

Add the following to your MCP configuration (e.g., `cline_mcp_settings.json`):

```json
{
  "servers": [
    {
      "name": "bitbucket-server-mcp",
      "command": "npx",
      "args": ["-y", "bitbucket-server-mcp"],
      "env": {
        "BITBUCKET_URL": "https://your-bitbucket-server",
        "BITBUCKET_TOKEN": "your-access-token",
        "BITBUCKET_DEFAULT_PROJECT": "your-default-project",
        "BITBUCKET_DEFAULT_REVIEWERS": "user1,user2"
      }
    }
  ]
}
```

### Direct Node Usage

If npx is unavailable, configure as follows:

- **Windows:**
  ```json
  "command": "node",
  "args": ["C:\\path\\to\\bitbucket-server-mcp\\build\\index.js"],
  ```
- **Mac/Linux:**
  ```json
  "command": "node",
  "args": ["/path/to/bitbucket-server-mcp/build/index.js"],
  ```

---

## Environment Variables

| Variable                    | Description                                 | Required | Example                        |
|-----------------------------|---------------------------------------------|----------|--------------------------------|
| `BITBUCKET_URL`             | Bitbucket Server base URL                   | Yes      | `https://bitbucket.example.com`|
| `BITBUCKET_TOKEN`           | Personal access token                       | Yes      | `your-access-token`            |
| `BITBUCKET_DEFAULT_PROJECT` | Default project key                         | No       | `PROJKEY`                      |
| `BITBUCKET_DEFAULT_REVIEWERS` | Comma-separated reviewer usernames        | No       | `user1,user2`                  |
| `BITBUCKET_USERNAME`        | Username (if not using token)               | No       | `your-username`                |
| `BITBUCKET_PASSWORD`        | Password (if not using token)               | No       | `your-password`                |

See `.env.example` for details.

---

## Development

- Lint code:  
  ```sh
  npm run lint
  ```
- Run in watch mode:  
  ```sh
  npm run dev
  ```

---

## Testing

Run the test suite:

```sh
npm test
```

---

## Contributing

Contributions are welcome! Please open issues or submit pull requests for new features, bug fixes, or improvements.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

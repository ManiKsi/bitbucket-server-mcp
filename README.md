# bitbucket-server-mcp

## Description

A Model Context Protocol (MCP) server for integrating with Bitbucket Server, providing tools for pull request management and code review automation.

## Features

### Implemented

- List repositories in a project
- List all pull requests for a repository
- List branches in a repository
- Get repository details
- Create a new pull request
- Get pull request details
- Merge a pull request (merge-commit, squash, fast-forward)
- Decline (close) a pull request
- Delete a pull request (by declining)
- Add a comment to a pull request
- Add an inline comment to a file in a pull request
- Suggest a code change (inline suggestion)
- Get pull request diff
- Get pull request reviews (approved/reviewed)
- Tool handler wiring for MCP protocol

### TODO / Missing Features

- Create/delete branches
- Get user information (current user, reviewers, etc.)
- Support for webhooks or event notifications
- Enhanced error reporting and logging
- Pagination support for large result sets
- More granular permission checks
- Automated tests for all API endpoints

## Project Structure

```
.
├── src/
│   ├── bitbucket-server.ts   # Main BitbucketServer class and logic
│   └── index.ts              # Entrypoint for the MCP server
├── tests/
│   └── index.test.ts         # Test suite
├── .env.example              # Example environment variables
├── .eslintrc.json            # ESLint configuration
├── Dockerfile                # Docker support
├── jest.config.js            # Jest configuration
├── LICENSE
├── package.json
├── package-lock.json
├── README.md
├── smithery.yaml             # MCP server configuration
├── tsconfig.json             # TypeScript configuration
```

## Setup

1. Install dependencies:
   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your Bitbucket Server credentials.

## Usage

### Run via npx (recommended)

You can run the MCP server without cloning or building the project:

```sh
npx -y bitbucket-server-mcp
```

If the npx command fails or you need a local installation, follow these steps:

1. Clone the repository and install dependencies:
   ```sh
   git clone https://github.com/your-org/bitbucket-server-mcp.git
   cd bitbucket-server-mcp
   npm install
   npm run build
   ```

2. Use the following configuration to run the MCP server directly (works on both Windows and Mac/Linux):

   - On **Windows**, use:
     ```json
     "bitbucket": {
       "disabled": true,
       "timeout": 60,
       "command": "node",
       "args": [
         "C:\\path\\to\\bitbucket-server-mcp\\build\\index.js"
       ],
       "env": {
         "BITBUCKET_URL": "https://your-bitbucket-server",
         "BITBUCKET_TOKEN": "your-access-token",
         "BITBUCKET_DEFAULT_PROJECT": "your-default-project",
         "BITBUCKET_DEFAULT_REVIEWERS": "user1,user2"
       },
       "transportType": "stdio"
     }
     ```

   - On **Mac/Linux**, use:
     ```json
     "bitbucket": {
       "disabled": true,
       "timeout": 60,
       "command": "node",
       "args": [
         "/path/to/bitbucket-server-mcp/build/index.js"
       ],
       "env": {
         "BITBUCKET_URL": "https://your-bitbucket-server",
         "BITBUCKET_TOKEN": "your-access-token",
         "BITBUCKET_DEFAULT_PROJECT": "your-default-project",
         "BITBUCKET_DEFAULT_REVIEWERS": "user1,user2"
       },
       "transportType": "stdio"
     }
     ```

### Local development

To start the MCP server locally after building:

```sh
npm start
```
Or directly:
```sh
node build/index.js
```

## MCP Server Configuration

To use this MCP server with the Model Context Protocol, add it to your MCP configuration (e.g., `cline_mcp_settings.json`):

```json
{
  "servers": [
    {
      "name": "bitbucket-server-mcp",
      "command": "npx -y bitbucket-server-mcp",
      "args": [],
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

## Environment Variables

- `BITBUCKET_URL` (required): Base URL of your Bitbucket Server.
- `BITBUCKET_TOKEN`: Personal access token (recommended).
- `BITBUCKET_DEFAULT_PROJECT`: Default Bitbucket project key.
- `BITBUCKET_DEFAULT_REVIEWERS`: Default reviewers for pull requests.

See `.env.example` for details.

## Testing

Run tests with:
```sh
npm test
```

## License

See [LICENSE](LICENSE).

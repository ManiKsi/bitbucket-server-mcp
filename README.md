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

To start the MCP server:
```sh
npm start
```
Or directly:
```sh
node build/index.js
```

## Environment Variables

- `BITBUCKET_URL` (required): Base URL of your Bitbucket Server.
- `BITBUCKET_TOKEN`: Personal access token (recommended).
- `BITBUCKET_USERNAME` and `BITBUCKET_PASSWORD`: Alternative to token authentication.
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

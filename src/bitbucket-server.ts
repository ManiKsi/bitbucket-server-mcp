// src/bitbucket-server.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import winston from 'winston';

import {
  BitbucketConfig,
  PullRequestInput,
  PullRequestParams,
} from './types.js';

import {
  createPullRequest,
  getPullRequest,
  mergePullRequest,
  declinePullRequest,
  addComment,
  getDiff,
  getReviews,
  addInlineComment,
  listRepositories,
  listPullRequests,
  listBranches,
  getRepositoryDetails,
} from './bitbucket-api.js';

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'bitbucket.log' })
  ]
});

export class BitbucketServer {
  private readonly server: Server;
  private readonly api: AxiosInstance;
  private readonly config: BitbucketConfig;

  constructor() {
    this.server = new Server(
      {
        name: 'bitbucket-server-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Load config from environment variables
    this.config = {
      baseUrl: process.env.BITBUCKET_URL ?? '',
      token: process.env.BITBUCKET_TOKEN,
      username: process.env.BITBUCKET_USERNAME,
      password: process.env.BITBUCKET_PASSWORD,
      defaultProject: process.env.BITBUCKET_DEFAULT_PROJECT
    };

    if (!this.config.baseUrl) {
      throw new Error('BITBUCKET_URL is required');
    }

    if (!this.config.token && !(this.config.username && this.config.password)) {
      throw new Error('Either BITBUCKET_TOKEN or BITBUCKET_USERNAME/PASSWORD is required');
    }

    this.api = axios.create({
      baseURL: `${this.config.baseUrl}/rest/api/latest`,
      headers: this.config.token 
        ? { Authorization: `Bearer ${this.config.token}` }
        : {},
      auth: this.config.username && this.config.password
        ? { username: this.config.username, password: this.config.password }
        : undefined,
    });

    this.setupToolHandlers();
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
  }

  private isPullRequestInput(args: unknown): args is PullRequestInput {
    const input = args as Partial<PullRequestInput>;
    return typeof args === 'object' &&
      args !== null &&
      typeof input.project === 'string' &&
      typeof input.repository === 'string' &&
      typeof input.title === 'string' &&
      typeof input.sourceBranch === 'string' &&
      typeof input.targetBranch === 'string' &&
      (input.description === undefined || typeof input.description === 'string') &&
      (input.reviewers === undefined || Array.isArray(input.reviewers));
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_repositories',
          description: 'List all repositories in a Bitbucket project',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' }
            },
            required: ['project']
          }
        },
        {
          name: 'list_pull_requests',
          description: 'List all pull requests for a repository in a Bitbucket project',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' }
            },
            required: ['project', 'repository']
          }
        },
        {
          name: 'list_branches',
          description: 'List all branches in a repository',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' }
            },
            required: ['project', 'repository']
          }
        },
        {
          name: 'get_repository_details',
          description: 'Get details of a repository',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' }
            },
            required: ['project', 'repository']
          }
        },
        {
          name: 'create_pull_request',
          description: 'Create a new pull request',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' },
              title: { type: 'string', description: 'PR title' },
              description: { type: 'string', description: 'PR description' },
              sourceBranch: { type: 'string', description: 'Source branch name' },
              targetBranch: { type: 'string', description: 'Target branch name' },
              reviewers: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of reviewer usernames'
              }
            },
            required: ['repository', 'title', 'sourceBranch', 'targetBranch']
          }
        },
        {
          name: 'get_pull_request',
          description: 'Get pull request details',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' },
              prId: { type: 'number', description: 'Pull request ID' }
            },
            required: ['repository', 'prId']
          }
        },
        {
          name: 'merge_pull_request',
          description: 'Merge a pull request',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' },
              prId: { type: 'number', description: 'Pull request ID' },
              message: { type: 'string', description: 'Merge commit message' },
              strategy: {
                type: 'string',
                enum: ['merge-commit', 'squash', 'fast-forward'],
                description: 'Merge strategy to use'
              }
            },
            required: ['repository', 'prId']
          }
        },
        {
          name: 'decline_pull_request',
          description: 'Decline a pull request',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' },
              prId: { type: 'number', description: 'Pull request ID' },
              message: { type: 'string', description: 'Reason for declining' }
            },
            required: ['repository', 'prId']
          }
        },
        {
          name: 'add_comment',
          description: 'Add a comment to a pull request',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' },
              prId: { type: 'number', description: 'Pull request ID' },
              text: { type: 'string', description: 'Comment text' },
              parentId: { type: 'number', description: 'Parent comment ID for replies' }
            },
            required: ['repository', 'prId', 'text']
          }
        },
        {
          name: 'get_diff',
          description: 'Get pull request diff',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' },
              prId: { type: 'number', description: 'Pull request ID' },
              contextLines: { type: 'number', description: 'Number of context lines' }
            },
            required: ['repository', 'prId']
          }
        },
        {
          name: 'get_reviews',
          description: 'Get pull request reviews',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' },
              prId: { type: 'number', description: 'Pull request ID' }
            },
            required: ['repository', 'prId']
          }
        },
        {
          name: 'add_inline_comment',
          description: 'Add an inline comment to a file in a pull request',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' },
              prId: { type: 'number', description: 'Pull request ID' },
              text: { type: 'string', description: 'Comment text' },
              filePath: { type: 'string', description: 'Path to the file in the repository' },
              line: { type: 'number', description: 'Line number to comment on' },
              lineType: {
                type: 'string',
                enum: ['CONTEXT', 'ADDED', 'REMOVED'],
                description: 'Type of line (default is CONTEXT)'
              },
              startColumn: { type: 'number', description: 'Starting column for code highlight (optional)' },
              endColumn: { type: 'number', description: 'Ending column for code highlight (optional)' },
              parentId: { type: 'number', description: 'Parent comment ID for replies' }
            },
            required: ['repository', 'prId', 'text', 'filePath', 'line']
          }
        },
        {
          name: 'suggest_code_change',
          description: 'Add a code suggestion comment to a file in a pull request',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' },
              prId: { type: 'number', description: 'Pull request ID' },
              filePath: { type: 'string', description: 'Path to the file in the repository' },
              line: { type: 'number', description: 'Line number to comment on' },
              lineType: {
                type: 'string',
                enum: ['CONTEXT', 'ADDED', 'REMOVED'],
                description: 'Type of line (default is CONTEXT)'
              },
              message: { type: 'string', description: 'Comment message explaining the suggestion (optional)' },
              suggestedCode: { type: 'string', description: 'The suggested code' },
              parentId: { type: 'number', description: 'Parent comment ID for replies' }
            },
            required: ['repository', 'prId', 'filePath', 'line', 'suggestedCode']
          }
        },
        {
          name: 'delete_pull_request',
          description: 'Delete a pull request by declining it',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Bitbucket project key' },
              repository: { type: 'string', description: 'Repository slug' },
              prId: { type: 'number', description: 'Pull request ID' },
              message: { type: 'string', description: 'Reason for deleting/declining' }
            },
            required: ['repository', 'prId']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        logger.info(`Called tool: ${request.params.name}`, { arguments: request.params.arguments });
        const args = request.params.arguments ?? {};

        const pullRequestParams: PullRequestParams = {
          project: (args.project as string) ?? this.config.defaultProject,
          repository: args.repository as string,
          prId: args.prId as number
        };

        if (!pullRequestParams.project) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Project must be provided either as a parameter or through BITBUCKET_DEFAULT_PROJECT environment variable'
          );
        }

        switch (request.params.name) {
          case 'list_repositories':
            if (!args.project || typeof args.project !== 'string') {
              throw new McpError(
                ErrorCode.InvalidParams,
                'Project key is required'
              );
            }
            return await listRepositories(this.api, args.project);
          case 'list_pull_requests':
            if (!args.project || typeof args.project !== 'string' || !args.repository || typeof args.repository !== 'string') {
              throw new McpError(
                ErrorCode.InvalidParams,
                'Project and repository are required'
              );
            }
            return await listPullRequests(this.api, args.project, args.repository);
          case 'list_branches':
            if (!args.project || typeof args.project !== 'string' || !args.repository || typeof args.repository !== 'string') {
              throw new McpError(
                ErrorCode.InvalidParams,
                'Project and repository are required'
              );
            }
            return await listBranches(this.api, args.project, args.repository);
          case 'get_repository_details':
            if (!args.project || typeof args.project !== 'string' || !args.repository || typeof args.repository !== 'string') {
              throw new McpError(
                ErrorCode.InvalidParams,
                'Project and repository are required'
              );
            }
            return await getRepositoryDetails(this.api, args.project, args.repository);
          case 'create_pull_request':
            // If reviewers not provided, use BITBUCKET_DEFAULT_REVIEWERS env
            if (!Array.isArray(args.reviewers) || args.reviewers.length === 0) {
              const defaultReviewers = process.env.BITBUCKET_DEFAULT_REVIEWERS;
              if (defaultReviewers) {
                args.reviewers = defaultReviewers.split(',').map(r => r.trim()).filter(Boolean);
              }
            }
            if (!this.isPullRequestInput(args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'Invalid pull request input parameters'
              );
            }
            return await createPullRequest(this.api, args);
          case 'get_pull_request':
            return await getPullRequest(this.api, pullRequestParams);
          case 'merge_pull_request':
            return await mergePullRequest(this.api, pullRequestParams, {
              message: args.message as string,
              strategy: args.strategy as 'merge-commit' | 'squash' | 'fast-forward'
            });
          case 'decline_pull_request':
            return await declinePullRequest(this.api, pullRequestParams, args.message as string);
          case 'add_comment':
            return await addComment(this.api, pullRequestParams, {
              text: args.text as string,
              parentId: args.parentId as number
            });
          case 'get_diff':
            return await getDiff(this.api, pullRequestParams, args.contextLines as number);
          case 'get_reviews':
            return await getReviews(this.api, pullRequestParams);
          case 'add_inline_comment':
            return await addInlineComment(this.api, pullRequestParams, {
              text: args.text as string,
              filePath: args.filePath as string,
              line: args.line as number,
              lineType: args.lineType as 'CONTEXT' | 'ADDED' | 'REMOVED',
              startColumn: args.startColumn as number,
              endColumn: args.endColumn as number,
              parentId: args.parentId as number
            });
          case 'suggest_code_change':
            return await addInlineComment(this.api, pullRequestParams, {
              text: args.message as string,
              filePath: args.filePath as string,
              line: args.line as number,
              lineType: args.lineType as 'CONTEXT' | 'ADDED' | 'REMOVED',
              suggestedCode: args.suggestedCode as string,
              parentId: args.parentId as number
            });
          case 'delete_pull_request':
            return await declinePullRequest(this.api, pullRequestParams, args.message as string);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        logger.error('Tool execution error', { error });
        if (axios.isAxiosError(error)) {
          throw new McpError(
            ErrorCode.InternalError,
            `Bitbucket API error: ${error.response?.data.message ?? error.message}`
          );
        }
        throw error;
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Bitbucket MCP server running on stdio');
  }
}

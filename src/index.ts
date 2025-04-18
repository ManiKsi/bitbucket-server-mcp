#!/usr/bin/env node
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

// Configuration du logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'bitbucket.log' })
  ]
});

interface BitbucketActivity {
  action: string;
  [key: string]: unknown;
}

interface BitbucketConfig {
  baseUrl: string;
  token?: string;
  username?: string;
  password?: string;
  defaultProject?: string;
}

interface RepositoryParams {
  project: string;
  repository: string;
}

interface PullRequestParams extends RepositoryParams {
  prId: number;
}

interface MergeOptions {
  message?: string;
  strategy?: 'merge-commit' | 'squash' | 'fast-forward';
}

interface CommentOptions {
  text: string;
  parentId?: number;
}

interface PullRequestInput extends RepositoryParams {
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  reviewers?: string[];
}

interface CommentPayload {
  text: string;
  anchor: {
    diffType: string;
    path: string;
    lineType: 'CONTEXT' | 'ADDED' | 'REMOVED';
    line: number;
    fileType: string;
    startColumn?: number;
    endColumn?: number;
  };
  parent?: { id: number };
}

class BitbucketServer {
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

    // Configuration initiale à partir des variables d'environnement
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

    // Configuration de l'instance Axios
    this.api = axios.create({
      baseURL: `${this.config.baseUrl}/rest/api/1.0`,
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
          case 'create_pull_request':
            if (!this.isPullRequestInput(args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'Invalid pull request input parameters'
              );
            }
            return await this.createPullRequest(args);
          case 'get_pull_request':
            return await this.getPullRequest(pullRequestParams);
          case 'merge_pull_request':
            return await this.mergePullRequest(pullRequestParams, {
              message: args.message as string,
              strategy: args.strategy as 'merge-commit' | 'squash' | 'fast-forward'
            });
          case 'decline_pull_request':
            return await this.declinePullRequest(pullRequestParams, args.message as string);
          case 'add_comment':
            return await this.addComment(pullRequestParams, {
              text: args.text as string,
              parentId: args.parentId as number
            });
          case 'get_diff':
            return await this.getDiff(pullRequestParams, args.contextLines as number);
          case 'get_reviews':
            return await this.getReviews(pullRequestParams);
          case 'add_inline_comment':
            return await this.addInlineComment(pullRequestParams, {
              text: args.text as string,
              filePath: args.filePath as string,
              line: args.line as number,
              lineType: args.lineType as 'CONTEXT' | 'ADDED' | 'REMOVED',
              startColumn: args.startColumn as number,
              endColumn: args.endColumn as number,
              parentId: args.parentId as number
            });
          case 'suggest_code_change':
            return await this.addInlineComment(pullRequestParams, {
              text: args.message as string,
              filePath: args.filePath as string,
              line: args.line as number,
              lineType: args.lineType as 'CONTEXT' | 'ADDED' | 'REMOVED',
              suggestedCode: args.suggestedCode as string,
              parentId: args.parentId as number
            });
          case 'delete_pull_request':
            return await this.declinePullRequest(pullRequestParams, args.message as string);
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

  private async createPullRequest(input: PullRequestInput) {
    const response = await this.api.post(
      `/projects/${input.project}/repos/${input.repository}/pull-requests`,
      {
        title: input.title,
        description: input.description,
        fromRef: {
          id: `refs/heads/${input.sourceBranch}`,
          repository: {
            slug: input.repository,
            project: { key: input.project }
          }
        },
        toRef: {
          id: `refs/heads/${input.targetBranch}`,
          repository: {
            slug: input.repository,
            project: { key: input.project }
          }
        },
        reviewers: input.reviewers?.map(username => ({ user: { name: username } }))
      }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async getPullRequest(params: PullRequestParams) {
    const { project, repository, prId } = params;
    const response = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}`
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async mergePullRequest(params: PullRequestParams, options: MergeOptions = {}) {
    const { project, repository, prId } = params;
    const { message, strategy = 'merge-commit' } = options;
    
    const response = await this.api.post(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/merge`,
      {
        version: -1,
        message,
        strategy
      }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async declinePullRequest(params: PullRequestParams, message?: string) {
    const { project, repository, prId } = params;
    const response = await this.api.post(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/decline`,
      {
        version: -1,
        message
      }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async addComment(params: PullRequestParams, options: CommentOptions) {
    const { project, repository, prId } = params;
    const { text, parentId } = options;
    
    const response = await this.api.post(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/comments`,
      {
        text,
        parent: parentId ? { id: parentId } : undefined
      }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async getDiff(params: PullRequestParams, contextLines: number = 10) {
    const { project, repository, prId } = params;
    const response = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/diff`,
      {
        params: { contextLines },
        headers: { Accept: 'text/plain' }
      }
    );

    return {
      content: [{ type: 'text', text: response.data }]
    };
  }

  private async getReviews(params: PullRequestParams) {
    const { project, repository, prId } = params;
    const response = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/activities`
    );

    const reviews = response.data.values.filter(
      (activity: BitbucketActivity) => activity.action === 'APPROVED' || activity.action === 'REVIEWED'
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(reviews, null, 2) }]
    };
  }

  private async addInlineComment(
    params: PullRequestParams,
    options: {
      text: string;
      filePath: string;
      line: number;
      lineType?: 'CONTEXT' | 'ADDED' | 'REMOVED';
      startColumn?: number;
      endColumn?: number;
      parentId?: number;
      suggestedCode?: string;
      originalCode?: string;
    }
  ) {
    const { project, repository, prId } = params;
    const {
      text,
      filePath,
      line,
      lineType = 'CONTEXT',
      startColumn,
      endColumn,
      parentId,
      suggestedCode,
      originalCode
    } = options;

    let finalText = text;
    if (suggestedCode) {
      const title = text || `Suggestion for ${filePath} at line ${line}`;
      let commentText = `${title}\n\n`;
      commentText += '```diff\n';
      if (originalCode) {
        const removedLines = originalCode.split('\n').map(l => `- ${l}`).join('\n');
        commentText += `${removedLines}\n`;
      }
      const addedLines = suggestedCode.split('\n').map(l => `+ ${l}`).join('\n');
      commentText += addedLines;
      commentText += '\n```';
      commentText += `\n\nSuggested code:\n\`\`\`\n${suggestedCode}\n\`\`\``;
      finalText = commentText;
    }



    const payload: CommentPayload = {
      text: finalText,
      anchor: {
        diffType: 'EFFECTIVE',
        path: filePath,
        lineType,
        line,
        fileType: 'TO',
        ...(startColumn && endColumn ? { startColumn, endColumn } : {})
      },
      parent: parentId ? { id: parentId } : undefined
    };

    const response = await this.api.post(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/comments`,
      payload
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Bitbucket MCP server running on stdio');
  }
}

const server = new BitbucketServer();
server.run().catch((error) => {
  logger.error('Server error', error);
  process.exit(1);
});
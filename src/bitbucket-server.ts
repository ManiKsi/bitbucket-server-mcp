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
    MergeOptions,
    CommentOptions
  } from './types.js';

  import {
    createPullRequest,
    getPullRequest,
    mergePullRequest,
    declinePullRequest,
    addComment,
    getDiff,
    getReviews,
    listRepositories,
    listPullRequests,
    listBranches,
    getRepositoryDetails,
    addInlineComment,
    getRepositoryArchive,
    getPullRequestComments,
    approvePullRequest,
    unapprovePullRequest,
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
        headers:{
              Authorization: `Bearer ${this.config.token}`,
              'X-Atlassian-Token': 'no-check'
            },
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
          },
          {
            name: 'approve_pull_request',
            description: 'Approve a pull request',
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
            name: 'unapprove_pull_request',
            description: 'Unapprove (reject approval for) a pull request',
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
            name: 'get_repository_archive',
            description: 'Download the entire repository as a zip or tar archive',
            inputSchema: {
              type: 'object',
              properties: {
                project: { type: 'string', description: 'Bitbucket project key' },
                repository: { type: 'string', description: 'Repository slug' },
                format: {
                  type: 'string',
                  enum: ['zip', 'tar'],
                  description: 'Archive format (zip or tar, default is zip)'
                },
                at: { type: 'string', description: 'Branch or commit to download (optional)' }
              },
              required: ['project', 'repository']
            }
          },
          {
            name: 'get_pull_request_comments',
            description: 'Get all comments on a pull request',
            inputSchema: {
              type: 'object',
              properties: {
                project: { type: 'string', description: 'Bitbucket project key' },
                repository: { type: 'string', description: 'Repository slug' },
                prId: { type: 'number', description: 'Pull request ID' }
              },
              required: ['project', 'repository', 'prId']
            }
          }
        ]
      }));

      this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name: toolName, arguments: toolInput } = request.params;
        const { project: inputProject, repository, prId, ...options } = toolInput as Record<string, any>;
        const project = inputProject ?? this.config.defaultProject;

        if (!project && ['list_repositories', 'create_pull_request', 'list_pull_requests', 'list_branches', 'get_repository_details', 'get_pull_request', 'merge_pull_request', 'decline_pull_request', 'add_comment', 'get_diff', 'get_reviews', 'add_inline_comment', 'suggest_code_change', 'delete_pull_request', 'get_repository_archive', 'get_pull_request_comments', 'approve_pull_request', 'unapprove_pull_request'].includes(toolName)) {
          return {
            content: [{ type: 'error', text: 'Project key is required if BITBUCKET_DEFAULT_PROJECT is not set.' }]
          };
        }

        const prParams: PullRequestParams = { project, repository, prId };

        try {
          switch (toolName) {
            case 'list_repositories':
              return await listRepositories(this.api, project);
            case 'list_pull_requests':
              return await listPullRequests(this.api, project, repository);
            case 'list_branches':
              return await listBranches(this.api, project, repository);
            case 'get_repository_details':
              return await getRepositoryDetails(this.api, project, repository);
            case 'create_pull_request':
              if (this.isPullRequestInput(toolInput)) {
                return await createPullRequest(this.api, { ...toolInput, project });
              }
              return { content: [{ type: 'error', text: 'Invalid input for create_pull_request' }] };
            case 'get_pull_request':
              return await getPullRequest(this.api, prParams);
            case 'merge_pull_request':
              return await mergePullRequest(this.api, prParams, options as MergeOptions);
            case 'decline_pull_request':
              return await declinePullRequest(this.api, prParams, options.message as string);
            case 'add_comment':
              return await addComment(this.api, prParams, options as CommentOptions);
            case 'get_diff':
              return await getDiff(this.api, prParams, options.contextLines as number);
            case 'get_reviews':
              return await getReviews(this.api, prParams);
            case 'add_inline_comment': {
              const { text, filePath, line, lineType, startColumn, endColumn, parentId } = options;
              return await addInlineComment(this.api, prParams, { text, filePath, line, lineType, startColumn, endColumn, parentId });
            }
            case 'suggest_code_change': {
              const { filePath, line, lineType, message, suggestedCode, parentId } = options;
              // The 'text' property for suggest_code_change is the 'message' from inputSchema
              return await addInlineComment(this.api, prParams, { text: message, filePath, line, lineType, suggestedCode, parentId });
            }
            case 'delete_pull_request': // Effectively decline
              return await declinePullRequest(this.api, prParams, options.message as string);
            case 'get_repository_archive': {
              const { format, at } = options;
              return await getRepositoryArchive(this.api, project, repository, format, at);
            }
            case 'get_pull_request_comments':
              return await getPullRequestComments(this.api, prParams);
            case 'approve_pull_request':
              return await approvePullRequest(this.api, prParams);
            case 'unapprove_pull_request':
              return await unapprovePullRequest(this.api, prParams);
            default:
              return {
                content: [{ type: 'error', text: `Unknown tool: ${toolName}` }]
              };
          }
        } catch (error: any) {
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

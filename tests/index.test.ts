// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('axios');

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';


// MCP SDK Types
type ToolResponse = {
  content: Array<{
    type: string;
    text: string;
  }>;
};

type ToolRequest = {
  method: 'call_tool';
  tool: string;
  arguments: unknown;
};

type RequestExtra = {
  signal: AbortSignal;
};

// Mock Server class
const MockServer = Server as jest.MockedClass<typeof Server>;

// Import code to test after mocks
import '../index';

describe('BitbucketServer', () => {
  // Mock variables
  let mockAxios: jest.Mocked<typeof axios>;
  let originalEnv: NodeJS.ProcessEnv;
  let mockServer: jest.Mocked<Server>;
  let mockAbortController: AbortController;

  beforeEach(() => {
    // Save environment variables
    originalEnv = process.env;
    process.env = {
      BITBUCKET_URL: 'https://bitbucket.example.com',
      BITBUCKET_TOKEN: 'test-token',
      BITBUCKET_DEFAULT_PROJECT: 'DEFAULT'
    };

    // Reset mocks
    jest.clearAllMocks();
    
    // Configure axios mock
    mockAxios = axios as jest.Mocked<typeof axios>;
    mockAxios.create.mockReturnValue({} as AxiosInstance);

    // Configure Server mock
    mockServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn(),
      close: jest.fn(),
      onerror: jest.fn()
    } as unknown as jest.Mocked<Server>;
    
    MockServer.mockImplementation(() => mockServer);

    // Configure AbortController for signal
    mockAbortController = new AbortController();
  });

  afterEach(() => {
    // Restore environment variables
    process.env = originalEnv;
  });

  describe('Configuration', () => {
    test('should throw if BITBUCKET_URL is not defined', () => {
      // Arrange
      process.env.BITBUCKET_URL = '';

      // Act & Assert
      expect(() => {
        require('../index');
      }).toThrow('BITBUCKET_URL is required');
    });

    test('should throw if neither token nor credentials are provided', () => {
      // Arrange
      process.env = {
        BITBUCKET_URL: 'https://bitbucket.example.com'
      };

      // Act & Assert
      expect(() => {
        require('../index');
      }).toThrow('Either BITBUCKET_TOKEN or BITBUCKET_USERNAME/PASSWORD is required');
    });

    test('should configure axios with token and read default project', () => {
      // Arrange
      const expectedConfig = {
        baseURL: 'https://bitbucket.example.com/rest/api/1.0',
        headers: { Authorization: 'Bearer test-token' },
      };

      // Act
      require('../index');

      // Assert
      expect(mockAxios.create).toHaveBeenCalledWith(expect.objectContaining(expectedConfig));
    });
  });

  describe('Pull Request Operations', () => {
    const mockHandleRequest = async <T>(toolName: string, args: T): Promise<ToolResponse> => {
      const handlers = mockServer.setRequestHandler.mock.calls;
      const callHandler = handlers.find(([schema]) => 
        (schema as { method?: string }).method === 'call_tool'
      )?.[1];
      if (!callHandler) throw new Error('Handler not found');
      
      const request: ToolRequest = {
        method: 'call_tool',
        tool: toolName,
        arguments: args
      };

      const extra: RequestExtra = {
        signal: mockAbortController.signal
      };

      return callHandler(request, extra) as Promise<ToolResponse>;
    };

    test('should create a pull request with explicit project', async () => {
      // Arrange
      const input = {
        project: 'TEST',
        repository: 'repo',
        title: 'Test PR',
        description: 'Test description',
        sourceBranch: 'feature',
        targetBranch: 'main',
        reviewers: ['user1']
      };

      mockAxios.post.mockResolvedValueOnce({ data: { id: 1 } });

      // Act
      const result = await mockHandleRequest('create_pull_request', input);

      // Assert
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/projects/TEST/repos/repo/pull-requests',
        expect.objectContaining({
          title: input.title,
          description: input.description,
          fromRef: expect.any(Object),
          toRef: expect.any(Object),
          reviewers: [{ user: { name: 'user1' } }]
        })
      );
      expect(JSON.parse(result.content[0].text)).toEqual({ id: 1 });
    });

    test('should create a pull request using default project', async () => {
      // Arrange
      const input = {
        repository: 'repo',
        title: 'Test PR',
        description: 'Test description',
        sourceBranch: 'feature',
        targetBranch: 'main',
        reviewers: ['user1']
      };

      mockAxios.post.mockResolvedValueOnce({ data: { id: 1 } });

      // Act
      const result = await mockHandleRequest('create_pull_request', input);

      // Assert
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/projects/DEFAULT/repos/repo/pull-requests',
        expect.objectContaining({
          title: input.title,
          description: input.description,
          fromRef: expect.any(Object),
          toRef: expect.any(Object),
          reviewers: [{ user: { name: 'user1' } }]
        })
      );
      expect(JSON.parse(result.content[0].text)).toEqual({ id: 1 });
    });

    test('should throw error when no project is provided or defaulted', async () => {
      // Arrange
      delete process.env.BITBUCKET_DEFAULT_PROJECT;
      const input = {
        repository: 'repo',
        title: 'Test PR',
        sourceBranch: 'feature',
        targetBranch: 'main'
      };

      // Act & Assert
      await expect(mockHandleRequest('create_pull_request', input))
        .rejects.toThrow(new McpError(
          ErrorCode.InvalidParams,
          'Project must be provided either as a parameter or through BITBUCKET_DEFAULT_PROJECT environment variable'
        ));
    });

    test('should merge a pull request', async () => {
      // Arrange
      const input = {
        project: 'TEST',
        repository: 'repo',
        prId: 1,
        message: 'Merged PR',
        strategy: 'squash' as const
      };

      mockAxios.post.mockResolvedValueOnce({ data: { state: 'MERGED' } });

      // Act
      const result = await mockHandleRequest('merge_pull_request', input);

      // Assert
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/projects/TEST/repos/repo/pull-requests/1/merge',
        expect.objectContaining({
          version: -1,
          message: input.message,
          strategy: input.strategy
        })
      );
      expect(JSON.parse(result.content[0].text)).toEqual({ state: 'MERGED' });
    });

    test('should handle API errors', async () => {
      // Arrange
      const input = {
        project: 'TEST',
        repository: 'repo',
        prId: 1
      };

      const error = {
        isAxiosError: true,
        response: {
          data: {
            message: 'Not found'
          }
        }
      };
      mockAxios.get.mockRejectedValueOnce(error);

      // Act & Assert
      await expect(mockHandleRequest('get_pull_request', input))
        .rejects.toThrow(new McpError(
          ErrorCode.InternalError,
          'Bitbucket API error: Not found'
        ));
    });
  });

  describe('Reviews and Comments', () => {
    const mockHandleRequest = async <T>(toolName: string, args: T): Promise<ToolResponse> => {
      const handlers = mockServer.setRequestHandler.mock.calls;
      const callHandler = handlers.find(([schema]) => 
        (schema as { method?: string }).method === 'call_tool'
      )?.[1];
      if (!callHandler) throw new Error('Handler not found');
      
      const request: ToolRequest = {
        method: 'call_tool',
        tool: toolName,
        arguments: args
      };

      const extra: RequestExtra = {
        signal: mockAbortController.signal
      };

      return callHandler(request, extra) as Promise<ToolResponse>;
    };

    test('should filter review activities', async () => {
      // Arrange
      const input = {
        project: 'TEST',
        repository: 'repo',
        prId: 1
      };

      const activities = {
        values: [
          { action: 'APPROVED', user: { name: 'user1' } },
          { action: 'COMMENTED', user: { name: 'user2' } },
          { action: 'REVIEWED', user: { name: 'user3' } }
        ]
      };

      mockAxios.get.mockResolvedValueOnce({ data: activities });

      // Act
      const result = await mockHandleRequest('get_reviews', input);

      // Assert
      const reviews = JSON.parse(result.content[0].text);
      expect(reviews).toHaveLength(2);
      expect(reviews.every((r: { action: string }) => 
        ['APPROVED', 'REVIEWED'].includes(r.action)
      )).toBe(true);
    });

    test('should add comment with parent', async () => {
      // Arrange
      const input = {
        project: 'TEST',
        repository: 'repo',
        prId: 1,
        text: 'Test comment',
        parentId: 123
      };

      mockAxios.post.mockResolvedValueOnce({ data: { id: 456 } });

      // Act
      const result = await mockHandleRequest('add_comment', input);

      // Assert
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/projects/TEST/repos/repo/pull-requests/1/comments',
        {
          text: input.text,
          parent: { id: input.parentId }
        }
      );
      expect(JSON.parse(result.content[0].text)).toEqual({ id: 456 });
    });
  });
});
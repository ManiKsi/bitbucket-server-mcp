// src/types.ts

export interface BitbucketActivity {
  action: string;
  [key: string]: unknown;
}

export interface BitbucketConfig {
  baseUrl: string;
  token?: string;
  username?: string;
  password?: string;
  defaultProject?: string;
}

export interface RepositoryParams {
  project: string;
  repository: string;
}

export interface PullRequestParams extends RepositoryParams {
  prId: number;
}

export interface MergeOptions {
  message?: string;
  strategy?: 'merge-commit' | 'squash' | 'fast-forward';
}

export interface CommentOptions {
  text: string;
  parentId?: number;
}

export interface PullRequestInput extends RepositoryParams {
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  reviewers?: string[];
}

export interface CommentPayload {
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

// src/bitbucket-api.ts

import { AxiosInstance } from 'axios';
import {
  PullRequestInput,
  PullRequestParams,
  MergeOptions,
  CommentOptions,
  CommentPayload,
  BitbucketActivity
} from './types.js';

export async function createPullRequest(api: AxiosInstance, input: PullRequestInput) {
  const response = await api.post(
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

export async function getPullRequest(api: AxiosInstance, params: PullRequestParams) {
  const { project, repository, prId } = params;
  const response = await api.get(
    `/projects/${project}/repos/${repository}/pull-requests/${prId}`
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
  };
}

export async function mergePullRequest(api: AxiosInstance, params: PullRequestParams, options: MergeOptions = {}) {
  const { project, repository, prId } = params;
  const { message, strategy = 'merge-commit' } = options;
  
  const response = await api.post(
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

export async function declinePullRequest(api: AxiosInstance, params: PullRequestParams, message?: string) {
  const { project, repository, prId } = params;
  const response = await api.post(
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

export async function addComment(api: AxiosInstance, params: PullRequestParams, options: CommentOptions) {
  const { project, repository, prId } = params;
  const { text, parentId } = options;
  
  const response = await api.post(
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

export async function getDiff(api: AxiosInstance, params: PullRequestParams, contextLines: number = 10) {
  const { project, repository, prId } = params;
  const response = await api.get(
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

export async function getReviews(api: AxiosInstance, params: PullRequestParams) {
  const { project, repository, prId } = params;
  const response = await api.get(
    `/projects/${project}/repos/${repository}/pull-requests/${prId}/activities`
  );

  const reviews = response.data.values.filter(
    (activity: BitbucketActivity) => activity.action === 'APPROVED' || activity.action === 'REVIEWED'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(reviews, null, 2) }]
  };
}

export async function listRepositories(api: AxiosInstance, project: string) {
  const response = await api.get(`/projects/${project}/repos`);
  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
  };
}

export async function listPullRequests(api: AxiosInstance, project: string, repository: string) {
  const response = await api.get(`/projects/${project}/repos/${repository}/pull-requests`);
  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
  };
}

export async function listBranches(api: AxiosInstance, project: string, repository: string) {
  const response = await api.get(`/projects/${project}/repos/${repository}/branches`);
  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
  };
}

export async function getRepositoryDetails(api: AxiosInstance, project: string, repository: string) {
  const response = await api.get(`/projects/${project}/repos/${repository}`);
  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
  };
}

export async function addInlineComment(
  api: AxiosInstance,
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

  const response = await api.post(
    `/projects/${project}/repos/${repository}/pull-requests/${prId}/comments`,
    payload
  );
  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
  };
}

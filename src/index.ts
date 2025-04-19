#!/usr/bin/env node
import { BitbucketServer } from './bitbucket-server.js';

const server = new BitbucketServer();
server.run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Server error', error);
  process.exit(1);
});

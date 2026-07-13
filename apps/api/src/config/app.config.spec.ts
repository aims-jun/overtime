import { resolve } from 'node:path';
import { resolveEnvFilePath } from './app.config';

describe('application config', () => {
  it('loads the monorepo root .env when the API runs from its workspace', () => {
    const apiWorkspace = resolve('/workspace', 'apps/api');

    expect(resolveEnvFilePath(apiWorkspace)).toBe(resolve('/workspace/.env'));
  });
});

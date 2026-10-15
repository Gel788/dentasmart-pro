// Vercel ignoreCommand: exit 0 skips the deployment, exit 1 builds it.
// The clinic site lives in apps/web and builds on Vercel.
// The Nest API does not run on Vercel. It ships from render.yaml.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const hint = [
  process.env.VERCEL_PROJECT_NAME,
  process.env.VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
].filter(Boolean).join(' ');

const here = process.cwd();
const nestHere = existsSync(join(here, 'nest-cli.json'));
const nextHere = ['next.config.ts', 'next.config.mjs', 'next.config.js'].some((file) => existsSync(join(here, file)));

if (nestHere && !nextHere) {
  console.log('Skip Vercel build: this directory is the Nest API. Deploy it with Render (render.yaml).');
  process.exit(0);
}

const monorepoRoot = !nextHere
  && existsSync(join(here, 'apps/api/nest-cli.json'))
  && existsSync(join(here, 'apps/web/next.config.ts'));
const looksLikeApi = /(?:^|[^a-z])api(?:[^a-z]|$)/i.test(hint);
const looksLikeWeb = /(?:^|[^a-z])web(?:[^a-z]|$)/i.test(hint) && !looksLikeApi;

if (looksLikeApi && !nextHere) {
  console.log(`Skip Vercel build: project looks like the API (${hint}). Deploy it with Render (render.yaml).`);
  process.exit(0);
}

if (process.env.VERCEL === '1' && monorepoRoot && !looksLikeWeb) {
  console.log('Skip Vercel build at the repo root. The site builds from apps/web; the API deploys with Render (render.yaml).');
  process.exit(0);
}

console.log(`Continue Vercel build${hint ? ` for ${hint}` : ''}.`);
process.exit(1);

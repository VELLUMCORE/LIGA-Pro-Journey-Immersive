
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}
function exists(file) {
  return fs.existsSync(file);
}
function replaceOrThrow(content, pattern, replacement, label) {
  const next = content.replace(pattern, replacement);
  if (next === content) {
    throw new Error(`Could not patch: ${label}`);
  }
  return next;
}

const root = process.cwd();

const releaseYml = `name: Release

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    runs-on: windows-2022

    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"
      GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
      FIREBASE_CLIENT_EMAIL: ""
      FIREBASE_KEY_ID: ""
      FIREBASE_PROJECT_ID: ""
      GH_ISSUES_CLIENT_ID: ""

    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-python@v6
        with:
          python-version: "3.10"

      - uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: npm

      - name: Show versions
        shell: bash
        run: |
          node --version
          npm --version
          python --version

      - name: Install dependencies
        run: npm ci --legacy-peer-deps

      - name: Publish dry-run
        env:
          GH_PUBLISH_API_KEY: \${{ secrets.GITHUB_TOKEN }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          FIREBASE_CLIENT_EMAIL: ""
          FIREBASE_KEY_ID: ""
          FIREBASE_PROJECT_ID: ""
          GH_ISSUES_CLIENT_ID: ""
        run: npm run publish -- --dry-run

      - name: Publish release
        env:
          GH_PUBLISH_API_KEY: \${{ secrets.GITHUB_TOKEN }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          FIREBASE_CLIENT_EMAIL: ""
          FIREBASE_KEY_ID: ""
          FIREBASE_PROJECT_ID: ""
          GH_ISSUES_CLIENT_ID: ""
        run: npm run publish -- --from-dry-run
`;

write(path.join(root, '.github', 'workflows', 'release.yml'), releaseYml);

const stub = `export namespace components {
  export namespace schemas {
    export interface Player {
      name: string;
    }

    export interface Team {
      name: string;
      slug: string;
      players: Player[];
    }
  }
}
`;
write(path.join(root, 'cli', 'generated', 'pandascore.ts'), stub);

const scraperPath = path.join(root, 'cli', 'scraper.ts');
if (exists(scraperPath)) {
  let scraper = read(scraperPath);

  scraper = scraper.replace(
    /import\s+\*\s+as\s+PandaScore\s+from\s+['"]\.\/generated\/pandascore['"];?\s*/m,
    `interface MinimalPandaPlayer { name: string; }
interface MinimalPandaTeam { name: string; slug: string; players: MinimalPandaPlayer[]; }
`
  );

  scraper = scraper.replace(
    /type\s+TeamAPIResponse\s*=\s*PandaScore\.components\['schemas'\]\['Team'\];?\s*/m,
    `type TeamAPIResponse = MinimalPandaTeam;\n`
  );

  scraper = scraper.replace(
    /type\s+PlayerAPIResponse\s*=\s*PandaScore\.components\['schemas'\]\['Player'\];?\s*/m,
    `type PlayerAPIResponse = MinimalPandaPlayer;\n`
  );

  scraper = scraper.replace(
    /item\.players\.map\(\s*\(\s*player\s*\)\s*=>/m,
    `item.players.map((player: { name: string }) =>`
  );

  write(scraperPath, scraper);
}

const playPath = path.join(root, 'src', 'backend', 'handlers', 'play.ts');
if (exists(playPath)) {
  let play = read(playPath);

  play = play.replace(
    /match\.competitors\.map\(\s*\(\s*competitor\s*\)\s*=>/m,
    `match.competitors.map((competitor: { id: number; teamId: number }) =>`
  );

  play = play.replace(
    /match\.competitors\.find\(\s*\(\s*competitor\s*\)\s*=>/m,
    `match.competitors.find((competitor: { id: number; teamId: number }) =>`
  );

  write(playPath, play);
}

const worldgenPath = path.join(root, 'src', 'backend', 'lib', 'worldgen.ts');
if (exists(worldgenPath)) {
  let worldgen = read(worldgenPath);

  if (!/competitionStartDate\?:\s*string\s*\|\s*Date/.test(worldgen)) {
    worldgen = worldgen.replace(
      /async function createMatchdays\(\s*([^)]*?mapName\??:\s*string,\s*vetoMapName\??:\s*string)\s*\)/s,
      `async function createMatchdays($1, competitionStartDate?: string | Date)`
    );
  }

  write(worldgenPath, worldgen);
}

const packagePath = path.join(root, 'package.json');
if (exists(packagePath)) {
  const pkg = JSON.parse(read(packagePath));

  pkg.main = './.webpack/main';
  pkg.name = 'liga-pro-journey-immersive';
  pkg.productName = 'LIGA Pro Journey Immersive';
  pkg.description = 'Heavily edited LIGA Pro Journey fork focused on immersive real-time player career simulation.';

  pkg.scripts = pkg.scripts || {};
  pkg.scripts['db:generate'] = 'prisma generate --schema src/backend/prisma/schema.prisma';
  pkg.scripts['db:init'] = 'prisma migrate dev --schema src/backend/prisma/schema.prisma';
  pkg.scripts['db:migrate'] = 'prisma migrate deploy --schema src/backend/prisma/schema.prisma';
  pkg.scripts['postinstall'] = 'npm run db:generate && node scripts/postinstall.cjs';

  write(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

const postinstall = `const { execSync } = require('node:child_process');

function run(command) {
  execSync(command, { stdio: 'inherit', shell: true });
}

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

if (isCI) {
  console.log('[postinstall] CI detected: skipping interactive Prisma migration and cli:init');
  process.exit(0);
}

console.log('[postinstall] Local install detected: running development initialization');
run('npm run db:migrate');
run('npm run cli:init');
`;
write(path.join(root, 'scripts', 'postinstall.cjs'), postinstall);

write(path.join(root, '.npmrc'), 'legacy-peer-deps=true\n');

console.log('Hotfix applied successfully.');

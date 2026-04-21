const { execSync } = require('node:child_process');

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

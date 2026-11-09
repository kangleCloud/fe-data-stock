import { spawnSync } from 'node:child_process';

const [action, moduleName, ...extra] = process.argv.slice(2);
const modules = ['stock-dashboard', 'admin', 'risk-dashboard'];
if (!['dev', 'build'].includes(action) || !modules.includes(moduleName) || extra.length) {
  console.error(`用法: pnpm run ${action === 'build' ? 'build:prod' : 'dev'} <${modules.join('|')}>`);
  process.exit(1);
}
const run = (args) => spawnSync('pnpm', args, { stdio: 'inherit', env: { ...process.env, STOCK_FRONTEND_MODULE: moduleName } }).status ?? 1;
if (action === 'build') {
  const status = run(['type-check']);
  if (status) process.exit(status);
}
process.exit(run(['exec', 'vite', ...(action === 'build' ? ['build'] : [])]));

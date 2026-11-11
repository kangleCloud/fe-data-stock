import { spawn, spawnSync } from 'node:child_process';

const [action, moduleName, ...extra] = process.argv.slice(2);
const modules = ['stock-dashboard', 'admin', 'risk-dashboard'];
if (!['dev', 'build'].includes(action) || !(modules.includes(moduleName) || action === 'dev' && moduleName === 'all') || extra.length) {
  console.error(`用法: pnpm run ${action === 'build' ? 'build:prod' : 'dev'} <${modules.join('|')}${action === 'dev' ? '|all' : ''}>`);
  process.exit(1);
}
if (action === 'dev' && moduleName === 'all') {
  const children = modules.map((name) => spawn('pnpm', ['exec', 'vite'], {
    stdio: 'inherit',
    env: { ...process.env, STOCK_FRONTEND_MODULE: name, STOCK_DEV_ALL: '1' },
  }));
  let stopping = false;
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    children.forEach((child) => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); });
    process.exitCode = code;
  };
  children.forEach((child) => {
    child.on('error', (error) => { console.error(error.message); stop(1); });
    child.on('exit', (code, signal) => { if (!stopping) stop(code ?? (signal ? 1 : 0)); });
  });
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
} else {
const run = (args) => spawnSync('pnpm', args, { stdio: 'inherit', env: { ...process.env, STOCK_FRONTEND_MODULE: moduleName } }).status ?? 1;
if (action === 'build') {
  const status = run(['type-check']);
  if (status) process.exit(status);
}
process.exit(run(['exec', 'vite', ...(action === 'build' ? ['build'] : [])]));
}

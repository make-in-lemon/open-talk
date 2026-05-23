const { execSync } = require('child_process');
try {
  const output = execSync('node dist/main.js', {
    cwd: __dirname,
    timeout: 15000,
    encoding: 'utf-8',
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  console.log('STDOUT:', output);
} catch (e) {
  console.log('EXIT CODE:', e.status);
  console.log('STDOUT:', e.stdout);
  console.log('STDERR:', e.stderr);
}

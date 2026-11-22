// Maritime entrypoint for the board worker agent.
// Maritime needs a server on $PORT (GET /health, POST /chat). The VM's /etc/hosts has no localhost,
// which `npm run build` needs. Both are handled here as root; boot.sh then runs as the `node` user.
const http = require('node:http');
const fs = require('node:fs');
const { spawn, execFileSync } = require('node:child_process');

const PORT = Number(process.env.PORT || 8080);
const DATA = '/data';
const RETRY_MS = 30000;
const isRoot = process.getuid() === 0;
const ring = [];
const state = { startedAt: null, restarts: 0, lastExit: null, running: false };

function ensureLocalhost() {
  const hosts = fs.readFileSync('/etc/hosts', 'utf8');
  if (!/\blocalhost\b/.test(hosts)) fs.appendFileSync('/etc/hosts', '127.0.0.1 localhost\n::1 localhost\n');
}

// The micro-VM's /dev has no fd, stdin, stdout or stderr links, so bash `<(...)` in board-worker.sh fails.
function ensureDevLinks() {
  for (const [name, target] of [['fd', '/proc/self/fd'], ['stdin', '/proc/self/fd/0'], ['stdout', '/proc/self/fd/1'], ['stderr', '/proc/self/fd/2']]) {
    if (!fs.existsSync(`/dev/${name}`)) fs.symlinkSync(target, `/dev/${name}`);
  }
}

function pump(stream, out) {
  let buf = '';
  stream.on('data', (d) => {
    out.write(d);
    const lines = (buf + d).split('\n');
    buf = lines.pop();
    for (const l of lines) { ring.push(l); if (ring.length > 80) ring.shift(); }
  });
}

function launch(ids) {
  const env = { ...process.env, HOME: process.env.HOME || DATA };
  const child = spawn('bash', ['/app/boot.sh'], { env, ...ids, stdio: ['ignore', 'pipe', 'pipe'] });
  state.startedAt = new Date().toISOString();
  state.running = true;
  pump(child.stdout, process.stdout);
  pump(child.stderr, process.stderr);
  let again = (why) => {
    again = () => {}; // 'error' and 'exit' can both fire for one failure
    state.running = false;
    state.lastExit = `${why} at ${new Date().toISOString()}`;
    state.restarts++;
    console.error(`[start] boot.sh ${why}; retrying in ${RETRY_MS / 1000}s`);
    setTimeout(() => launch(ids), RETRY_MS);
  };
  child.on('error', (e) => again(`failed to spawn: ${e.message}`));
  child.on('exit', (code, sig) => again(`exited code=${code} signal=${sig}`));
}

function status() {
  return `board worker ${state.running ? 'running' : 'stopped'} since ${state.startedAt}, restarts ${state.restarts}, last exit: ${state.lastExit || 'none'}\n` +
    ring.slice(-25).join('\n');
}

http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200).end('ok'); return; }
  req.resume(); // POST /chat: any message gets the worker status
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ response: status() }));
}).listen(PORT, '0.0.0.0', () => console.error(`[start] listening on ${PORT}`));

let ids = {};
if (isRoot) {
  try {
    ensureLocalhost();
    ensureDevLinks();
    const uid = Number(execFileSync('id', ['-u', 'node']));
    const gid = Number(execFileSync('id', ['-g', 'node']));
    fs.mkdirSync(DATA, { recursive: true });
    fs.chownSync(DATA, uid, gid);
    ids = { uid, gid };
  } catch (e) {
    console.error(`[start] root setup failed: ${e.message}`);
    process.exit(1);
  }
}
launch(ids);

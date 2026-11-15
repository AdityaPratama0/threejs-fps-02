// Saltgate's entrypoint (Node 22, standard library only, offline). One program, two jobs.
//
// Hand-in, the default with no flags. The bounty runs `node main.ts` twice in a fresh container
// with a read-only repository and a writable /output; this mode copies game/ and screenshots/
// from beside this file to /output and writes /output/dossier.json with buildDossier from
// vendor/makefun-threejs.ts. MAKEFUN_OUTPUT_DIR stands in for /output outside the grader. Both
// runs must write the same bytes, so this path reads the tree in one fixed order and writes
// nothing that depends on the clock.
//
// Serve, behind `--port`. For play-testing and for the frames shots.json names: it serves game/
// on 127.0.0.1, sends the MIME types a browser game needs, refuses any request that would leave
// the root, and stops cleanly on SIGINT. game/src/main.js reads ?shot=<name>&seed=<n> and builds
// a deterministic frame for each entry in shots.json, so those screenshots are real renders.
//
//   node main.ts                          hand the entry in (writes $MAKEFUN_OUTPUT_DIR)
//   node main.ts --port 8080              serve game/ on http://127.0.0.1:8080/
//   node main.ts --port 0 --root game     serve a chosen tree on a free port
//   node main.ts --port 0 --once          serve one request, log it, exit
//
// Nothing here opens a socket except the loopback listener, and nothing is installed or built.

import { createReadStream, cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PORT = 8080;

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others
// refuse an entry the scorer would refuse (more than 4 screenshots or one over 256 KiB; more
// than 993 files in game/ or 48 MiB of game files, in all: game/ counts beside /output's own
// 1000-entry cap, its screenshots/ and dossier.json).
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

// What a browser game asks for. Anything else is opaque bytes and is never sniffed.
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
};

interface Options {
  serve: boolean;
  port: number;
  root: string;
  once: boolean;
}

function fail(message: string): never {
  process.stderr.write(`main: ${message}\n`);
  process.exit(2);
}

function usage(): string {
  return [
    'usage: node main.ts [--port N] [--root DIR] [--once]',
    '',
    '  no flags      hand the entry in: copy game/ and screenshots/ to $MAKEFUN_OUTPUT_DIR',
    '                (default /output) and write dossier.json there',
    '  --port N      serve --root on 127.0.0.1:N (0 picks a free port); implies serving',
    '  --root DIR    the directory to serve; default game/ beside this file',
    '  --once        exit after the first response, for smoke tests',
    '  -h, --help    print this text',
  ].join('\n');
}

function parsePort(raw: string): number {
  if (!/^\d{1,5}$/.test(raw)) fail(`--port must be a whole number from 0 to 65535, not ${JSON.stringify(raw)}`);
  const port = Number(raw);
  if (port > 65535) fail(`--port must be a whole number from 0 to 65535, not ${JSON.stringify(raw)}`);
  return port;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { serve: false, port: DEFAULT_PORT, root: join(HERE, 'game'), once: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    const value = (): string => {
      if (inline !== undefined) return inline;
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) fail(`${name} needs a value`);
      index += 1;
      return next;
    };
    switch (name) {
      case '--serve':
        if (inline !== undefined) fail('--serve takes no value');
        options.serve = true;
        break;
      case '--port':
        options.serve = true;
        options.port = parsePort(value());
        break;
      case '--root':
        options.serve = true;
        options.root = resolve(process.cwd(), value());
        break;
      case '--once':
        if (inline !== undefined) fail('--once takes no value');
        options.serve = true;
        options.once = true;
        break;
      case '-h':
      case '--help':
        process.stdout.write(`${usage()}\n`);
        process.exit(0);
        break;
      default:
        fail(`unknown option ${arg} (try --help)`);
    }
  }
  return options;
}

// Hand-in: the one behaviour the gate measures. Same order and same caps as the starter, so the
// dossier bytes do not move.
function handIn(): void {
  const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(out, { recursive: true });
  cpSync(join(HERE, 'game'), join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(join(HERE, 'screenshots'))) cpSync(join(HERE, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_CAPS));
}

function logRequest(method: string, path: string, status: number, bytes: number): void {
  process.stdout.write(`${method} ${path} ${status} ${bytes}\n`);
}

// What a request resolved to. 'file' means statSync already proved a regular file at that path;
// 'refuse' carries the status the client gets and why, so the handler has one branch per case.
type Target =
  | { kind: 'file'; path: string; size: number }
  | { kind: 'refuse'; status: number; reason: string };

// The one place a request turns into a path. It decodes once, drops the query and fragment, maps a
// directory to index.html, and collapses . and .. with normalize() before joining, so a decoded
// ".." cannot climb: normalize clamps a leading run of them at "/". The prefix check after the join
// is the second lock, and it refuses anything that still lands outside root, symlinked directories
// included (realpath is deliberately not used: the tree is plain files, and a link would be a
// change worth noticing rather than following).
function resolveTarget(root: string, rawUrl: string): Target {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://127.0.0.1').pathname);
  } catch {
    return { kind: 'refuse', status: 400, reason: 'undecodable path' };
  }
  if (!pathname.startsWith('/')) return { kind: 'refuse', status: 400, reason: 'not an origin path' };
  if (pathname.includes('\0')) return { kind: 'refuse', status: 400, reason: 'NUL in path' };
  if (pathname.endsWith('/')) pathname += 'index.html';

  const path = resolve(join(root, normalize(pathname)));
  if (path !== root && !path.startsWith(root + sep)) {
    return { kind: 'refuse', status: 403, reason: 'outside the root' };
  }

  try {
    const stats = statSync(path);
    if (!stats.isFile()) return { kind: 'refuse', status: 404, reason: 'not a regular file' };
    return { kind: 'file', path, size: stats.size };
  } catch {
    return { kind: 'refuse', status: 404, reason: 'no such file' };
  }
}

function sendText(
  response: ServerResponse,
  status: number,
  text: string,
  method: string,
  path: string,
  extra?: Record<string, string>,
): void {
  const body = `${text}\n`;
  const bytes = Buffer.byteLength(body);
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': bytes,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
  });
  logRequest(method, path, status, bytes);
  response.end(method === 'HEAD' ? undefined : body);
}

function sendFile(
  response: ServerResponse,
  target: { path: string; size: number },
  method: string,
  shown: string,
): void {
  response.writeHead(200, {
    'content-type': MIME[extname(target.path).toLowerCase()] ?? 'application/octet-stream',
    'content-length': target.size,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  logRequest(method, shown, 200, target.size);
  if (method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(target.path);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
  onServed?: () => void,
): void {
  if (onServed !== undefined) response.once('close', onServed);

  const method = request.method ?? 'GET';
  const rawUrl = request.url ?? '/';
  if (method !== 'GET' && method !== 'HEAD') {
    sendText(response, 405, 'method not allowed', method, rawUrl, { allow: 'GET, HEAD' });
    return;
  }

  const target = resolveTarget(root, rawUrl);
  if (target.kind === 'refuse') {
    sendText(response, target.status, target.reason, method, rawUrl);
    return;
  }
  sendFile(response, target, method, relative(root, target.path));
}

function serve(options: Options): void {
  const root = resolve(options.root);
  let isDirectory = false;
  try {
    isDirectory = statSync(root).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) fail(`--root ${root} is not a directory`);

  let server: Server | undefined;
  let stopping = false;
  const stop = (reason: string): void => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(`main: ${reason}, shutting down\n`);
    process.exitCode = 0;
    if (server === undefined) return;
    // Close the listener, drop the sockets a browser may still hold open, and let the close
    // callback end the program. The watchdog only matters if a peer never lets go.
    server.close(() => process.exit(0));
    server.closeAllConnections();
    const watchdog = setTimeout(() => process.exit(0), 2000);
    watchdog.unref();
  };

  server = createServer((request, response) => {
    handleRequest(request, response, root, options.once ? () => stop('served one request') : undefined);
  });
  server.on('error', (error: Error) => {
    fail(`cannot listen on 127.0.0.1:${options.port}: ${error.message}`);
  });
  server.listen(options.port, '127.0.0.1', () => {
    // Startup logging is fixed text in a fixed place: the tree relative to this file when it sits
    // inside the entry, absolute otherwise, and the port the kernel actually bound (so --port 0 is
    // usable), so two runs of the same command log the same line.
    const address = server?.address();
    const bound = typeof address === 'object' && address !== null ? address.port : options.port;
    const shown = root === HERE ? '.' : root.startsWith(HERE) ? relative(HERE, root) : root;
    const suffix = options.once ? ' (one request)' : '';
    process.stdout.write(`main: serving ${shown} on http://127.0.0.1:${bound}/${suffix}\n`);
  });
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
}

const options = parseArgs(process.argv.slice(2));
if (options.serve) serve(options);
else handIn();

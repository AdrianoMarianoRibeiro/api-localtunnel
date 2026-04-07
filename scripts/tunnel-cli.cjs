#!/usr/bin/env node
/* eslint-disable no-console */
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

/**
 * pnpm/npm often forwards a standalone "--" separator to the script.
 * localtunnel's CLI (yargs) treats that as "end of options", so flags
 * after it are ignored and `port` appears missing.
 */
function stripArgSeparators(argv) {
  return argv.filter((token) => token !== '--');
}

function getFlagValue(args, names) {
  for (let i = 0; i < args.length; i += 1) {
    if (names.includes(args[i])) {
      return args[i + 1];
    }
  }
  return undefined;
}

/* ---- localtunnel helpers ---- */

function slugifySubdomain(input) {
  const raw = String(input).trim();
  if (!raw) throw new Error('Subdomain/url value is empty.');

  let hostPart = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      hostPart = new URL(raw).hostname;
    } catch {
      throw new Error(`Invalid URL: ${raw}`);
    }
  } else {
    hostPart = raw.split('/')[0];
  }

  hostPart = hostPart.replace(/:\d+$/, '');
  const slug = hostPart
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug || slug.length > 63) {
    throw new Error(
      `Invalid subdomain after normalization: "${input}" -> "${slug}" (use letters, numbers, hyphens; max 63 chars).`
    );
  }
  return slug;
}

function transformArgs(tokens) {
  const out = [];
  let i = 0;
  let subdomainFromUrl;

  while (i < tokens.length) {
    const t = tokens[i];

    if (t === '--url' || t === '-u') {
      const v = tokens[i + 1];
      if (v === undefined) {
        throw new Error(`${t} requires a value.`);
      }
      subdomainFromUrl = slugifySubdomain(v);
      i += 2;
      continue;
    }

    if (t === '--subdomain' || t === '-s') {
      const v = tokens[i + 1];
      if (v === undefined) throw new Error(`${t} requires a value.`);
      const slug = slugifySubdomain(v);
      if (slug !== v) {
        console.warn(
          `[tunnel] Subdomain normalized for localtunnel: "${v}" -> "${slug}"`
        );
      }
      out.push('--subdomain', slug);
      i += 2;
      continue;
    }

    out.push(t);
    i += 1;
  }

  if (subdomainFromUrl) {
    if (!out.includes('--subdomain')) {
      out.push('--subdomain', subdomainFromUrl);
    } else {
      console.warn('[tunnel] Ignoring --url because --subdomain was already provided.');
    }
  }
  return out;
}

function normalizeHost(value) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).hostname;
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0];
  }
}

function areEquivalentTunnelHosts(requestedHost, actualHostTail) {
  if (!requestedHost) return true;
  if (requestedHost === actualHostTail) return true;
  const aliases = new Set(['localtunnel.me', 'loca.lt']);
  return aliases.has(requestedHost) && aliases.has(actualHostTail);
}

/* ---- cloudflared helpers ---- */

const CLOUDFLARED_URL =
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
const CLOUDFLARED_LOCAL = path.join(__dirname, '..', 'bin', 'cloudflared');

function findCloudflared() {
  const candidates = [
    process.env.CLOUDFLARED_BINARY,
    CLOUDFLARED_LOCAL,
    'cloudflared',
  ];
  return candidates.find(Boolean);
}

function downloadCloudflared() {
  return new Promise((resolve, reject) => {
    console.log('[tunnel] Downloading cloudflared...');
    const { spawn } = require('node:child_process');

    const binDir = path.join(__dirname, '..', 'bin');
    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

    const curl = spawn('curl', [
      '-fSL',
      CLOUDFLARED_URL,
      '-o',
      CLOUDFLARED_LOCAL,
      '--create-dirs',
    ]);

    curl.on('close', (code) => {
      if (code !== 0) return reject(new Error(`curl exited with code ${code}`));
      fs.chmodSync(CLOUDFLARED_LOCAL, 0o755);
      console.log('[tunnel] cloudflared downloaded to bin/cloudflared');
      resolve();
    });

    curl.stderr.on('data', (d) => process.stderr.write(d));
  });
}

function runCloudflared(parsedArgs) {
  const bin = findCloudflared();
  const port = parsedArgs.port || process.env.APP_PORT || 3337;
  const hostname = parsedArgs.hostname;
  const token = parsedArgs.token;

  const args = ['tunnel', '--url', `localhost:${port}`];
  if (token) {
    args.push('--token', token);
  } else if (hostname) {
    args.push('--hostname', hostname);
  }

  console.log(`[tunnel] Starting cloudflared: ${bin} ${args.join(' ')}`);

  const child = spawn(bin, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const urlRegex = /https?:\/\/[^\s]+trycloudflare\.com[^\s]*/i;
  const hostnameRegex = /hostname=([^\s|]+)/i;

  const captureUrl = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);

    const m = text.match(urlRegex) || text.match(hostnameRegex);
    if (m) {
      const url = m[1] ? `https://${m[1]}` : m[0].replace(/\|.*$/, '').trim();
      console.log(`[tunnel] URL: ${url}`);
      // Remove capture listeners once we have the URL
      child.stdout?.removeListener('data', captureUrl);
      child.stderr?.removeListener('data', captureUrl);
    }
  };

  child.stdout?.on('data', captureUrl);
  child.stderr?.on('data', captureUrl);

  child.on('exit', (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 1);
  });
}

function runLocaltunnel(forwarded) {
  const ltPath = path.join(
    __dirname,
    '..',
    'node_modules',
    'localtunnel',
    'bin',
    'lt.js'
  );

  const requestedSubdomain = getFlagValue(forwarded, ['--subdomain', '-s']);
  const requestedHost = normalizeHost(getFlagValue(forwarded, ['--host', '-h']));
  const strictSubdomain = /^(1|true|yes|on)$/i.test(
    String(process.env.TUNNEL_STRICT_SUBDOMAIN || '')
  );

  const child = spawn(process.execPath, [ltPath, ...forwarded], {
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let forcedExitCode;
  const onOutput = (chunk, toStderr) => {
    const text = chunk.toString();
    if (toStderr) process.stderr.write(text);
    else process.stdout.write(text);

    if (!requestedSubdomain) return;

    const match = text.match(/your url is:\s*(https?:\/\/\S+)/i);
    if (!match) return;

    try {
      const url = new URL(match[1]);
      const actualSubdomain = url.hostname.split('.')[0];
      const actualHostTail = url.hostname.split('.').slice(1).join('.');

      if (actualSubdomain !== requestedSubdomain || !areEquivalentTunnelHosts(requestedHost, actualHostTail)) {
        console.error(
          `[tunnel] Requested subdomain "${requestedSubdomain}" was not granted. Got "${url.href}" instead.`
        );
        if (strictSubdomain) {
          forcedExitCode = 1;
          console.error(
            `[tunnel] Strict mode: stopping because requested host is unavailable.`
          );
          child.kill('SIGINT');
        } else {
          console.warn(
            `[tunnel] Continuing with fallback URL. Set TUNNEL_STRICT_SUBDOMAIN=1 to fail instead.`
          );
        }
      }
    } catch {
      // ignore parse errors
    }
  };

  child.stdout.on('data', (chunk) => onOutput(chunk, false));
  child.stderr.on('data', (chunk) => onOutput(chunk, true));

  child.on('exit', (code, signal) => {
    if (typeof forcedExitCode === 'number') process.exit(forcedExitCode);
    if (signal) process.exit(1);
    process.exit(code ?? 1);
  });
}

/* ---- main ---- */

function main() {
  const cleaned = stripArgSeparators(process.argv.slice(2));
  const provider = getFlagValue(cleaned, ['--provider', '-p']) || process.env.TUNNEL_PROVIDER || 'cloudflare';

  if (provider === 'cloudflare') {
    const parsedArgs = {
      port: getFlagValue(cleaned, ['--port']),
      hostname: getFlagValue(cleaned, ['--hostname', '-h']),
      token: getFlagValue(cleaned, ['--token', '-t']),
    };

    // If no cloudflared binary found, auto-download it.
    if (!findCloudflared()) {
      console.log('[tunnel] cloudflared not found, downloading...');
      return downloadCloudflared()
        .then(() => runCloudflared(parsedArgs))
        .catch((err) => {
          console.error('[tunnel] failed to download cloudflared:', err.message);
          console.error('[tunnel] falling back to localtunnel...');
          const forwarded = transformArgs(cleaned);
          const defaultHost = process.env.TUNNEL_HOST;
          if (defaultHost && !getFlagValue(forwarded, ['--host', '-h'])) {
            forwarded.push('--host', defaultHost);
          }
          runLocaltunnel(forwarded);
        });
    }

    return runCloudflared(parsedArgs);
  }

  // localtunnel fallback
  let forwarded;
  try {
    forwarded = transformArgs(cleaned);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const defaultHost = process.env.TUNNEL_HOST;
  if (defaultHost && !getFlagValue(forwarded, ['--host', '-h'])) {
    forwarded.push('--host', defaultHost);
  }

  return runLocaltunnel(forwarded);
}

main();

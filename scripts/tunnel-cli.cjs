#!/usr/bin/env node
/* eslint-disable no-console */
const { spawn } = require('node:child_process');
const path = require('node:path');

/**
 * pnpm/npm often forwards a standalone "--" separator to the script.
 * localtunnel's CLI (yargs) treats that as "end of options", so flags
 * after it are ignored and `port` appears missing.
 */
function stripArgSeparators(argv) {
  return argv.filter((token) => token !== '--');
}

/**
 * localtunnel public URLs are https://<subdomain>.localtunnel.me
 * The subdomain must be a single DNS label (no dots). Slugify user input.
 */
function slugifySubdomain(input) {
  const raw = String(input).trim();
  if (!raw) {
    throw new Error('Subdomain/url value is empty.');
  }

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
      `Invalid subdomain after normalization: "${input}" -> "${slug}" (use letters, numbers, hyphens; max 63 chars).`,
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
        throw new Error(`${t} requires a value (e.g. ${t} my-api or ${t} https://my-api.localtunnel.me).`);
      }
      subdomainFromUrl = slugifySubdomain(v);
      i += 2;
      continue;
    }

    if (t === '--subdomain' || t === '-s') {
      const v = tokens[i + 1];
      if (v === undefined) {
        throw new Error(`${t} requires a value.`);
      }
      const slug = slugifySubdomain(v);
      if (slug !== v) {
        console.warn(
          `[tunnel] Subdomain normalized for localtunnel (single label, no dots): "${v}" -> "${slug}"`,
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
    const hasSubdomainFlag = out.includes('--subdomain');
    if (!hasSubdomainFlag) {
      out.push('--subdomain', subdomainFromUrl);
    } else {
      console.warn('[tunnel] Ignoring --url because --subdomain was already provided.');
    }
  }

  return out;
}

function main() {
  const cleaned = stripArgSeparators(process.argv.slice(2));

  let forwarded;
  try {
    forwarded = transformArgs(cleaned);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const ltPath = path.join(__dirname, '..', 'node_modules', 'localtunnel', 'bin', 'lt.js');
  const child = spawn(process.execPath, [ltPath, ...forwarded], {
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
}

main();

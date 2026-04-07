import { ChildProcess, spawn } from 'node:child_process';
import { Injectable, Logger } from '@nestjs/common';
import {
  TunnelConfig,
  TunnelInfo,
  TunnelProvider,
  TunnelStatus,
} from './tunnel.types';

@Injectable()
export class CloudflareTunnelProvider implements TunnelProvider {
  readonly name = 'cloudflare' as const;

  private readonly logger = new Logger(CloudflareTunnelProvider.name);
  private child: ChildProcess | null = null;
  private config: TunnelConfig | null = null;
  private status: TunnelStatus = TunnelStatus.STOPPED;
  private url: string | null = null;
  private connectedAt: Date | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private pendingResolver: (() => void) | null = null;
  private rejectResolver: ((err: Error) => void) | null = null;
  private urlPromise: Promise<string> | null = null;

  onModuleInit(): void {
    const bin = this.findCloudflaredBinary();
    this.logger.log(`Found cloudflared binary at: ${bin}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  getInfo(): TunnelInfo {
    return {
      status: this.status,
      url: this.url,
      provider: 'cloudflare',
      connectedAt: this.connectedAt,
    };
  }

  async start(cfg?: TunnelConfig): Promise<TunnelInfo> {
    if (cfg) this.config = cfg;
    if (!this.config) {
      throw new Error('config not set');
    }

    if (
      this.status === TunnelStatus.CONNECTED ||
      this.status === TunnelStatus.CONNECTING
    ) {
      this.logger.warn('Tunnel already active, ignoring duplicate start call.');
      return this.getInfo();
    }

    this.clearReconnectTimer();
    this.reconnectAttempts = 0;

    this.setStatus(TunnelStatus.CONNECTING);
    this.url = null;
    this.connectedAt = null;

    const isQuickTunnel =
      !this.config.cloudflaredToken && !this.config.cloudflaredHostname;
    const args = isQuickTunnel
      ? this.buildQuickTunnelArgs()
      : this.buildManagedTunnelArgs();

    if (args.length === 0) return this.getInfo();

    const bin = this.findCloudflaredBinary();
    this.logger.log(`Launching cloudflared: ${bin} ${args.join(' ')}`);
    this.logger.log(`Forwarding localhost:${this.config.port}`);

    /* cloudflared quick tunnels take up to ~10 s to resolve.
       Wait for the URL so the call resolves cleanly. */
    this.urlPromise = new Promise<string>((resolve, reject) => {
      this.pendingResolver = () => {
        if (this.url) resolve(this.url);
        else reject(new Error('Tunnel stopped before URL was resolved'));
      };
      this.rejectResolver = reject;
      // safety fallback: reject after 20s
      setTimeout(() => {
        if (!this.url) {
          reject(new Error('cloudflared URL resolution timed out after 20s'));
          this.pendingResolver = null;
          this.rejectResolver = null;
        }
      }, 20_000);
    });

    this.child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this.wireChildProcess();

    try {
      const tunnelUrl = await this.urlPromise;
      this.url = tunnelUrl;
      this.connectedAt = new Date();
      this.urlPromise = null;
      this.pendingResolver = null;
      this.rejectResolver = null;
      this.reconnectAttempts = 0;
    } catch (err: unknown) {
      this.urlPromise = null;
      this.pendingResolver = null;
      this.rejectResolver = null;
      this.logger.error(
        `Failed to establish tunnel: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.child?.kill('SIGINT');
      this.child = null;
      this.setStatus(TunnelStatus.FAILED);
      throw err;
    }

    return this.getInfo();
  }

  async stop(): Promise<void> {
    this.clearReconnectTimer();

    if (!this.child || this.status === TunnelStatus.STOPPED) {
      this.setStatus(TunnelStatus.STOPPED);
      return;
    }

    this.logger.log('Stopping cloudflared tunnel...');

    // Clear any pending URL resolution
    if (this.rejectResolver) {
      this.rejectResolver(new Error('Tunnel stopped'));
      this.pendingResolver = null;
      this.rejectResolver = null;
    }

    this.child.kill('SIGINT');

    await new Promise<void>((resolve) => {
      this.child?.once('exit', () => resolve());
      setTimeout(() => {
        this.child?.kill('SIGKILL');
        resolve();
      }, 5_000);
    });

    this.child = null;
    this.setStatus(TunnelStatus.STOPPED);
    this.connectedAt = null;
    this.url = null;
  }

  /* -- private -- */

  private findCloudflaredBinary(): string {
    return (
      this.config?.cloudflaredBinary ||
      process.env.CLOUDFLARED_BINARY ||
      'cloudflared'
    );
  }

  private buildQuickTunnelArgs(): string[] {
    if (!this.config) return [];
    return ['tunnel', '--url', `localhost:${this.config.port}`];
  }

  private buildManagedTunnelArgs(): string[] {
    if (!this.config) return [];
    const args: string[] = ['tunnel'];

    if (this.config.cloudflaredToken) {
      args.push('--token', this.config.cloudflaredToken);
      args.push('--url', `localhost:${this.config.port}`);
    } else if (this.config.cloudflaredHostname) {
      args.push('--hostname', this.config.cloudflaredHostname);
      args.push('--url', `localhost:${this.config.port}`);
    } else {
      // fallback to quick tunnel
      return this.buildQuickTunnelArgs();
    }

    return args;
  }

  private setStatus(status: TunnelStatus) {
    this.status = status;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private wireChildProcess() {
    if (!this.child) return;

    // Collect URL from stdout.
    // cloudflared prints lines like:
    //   INF Updating DNS records ... | hostname=abc-123.trycloudflare.com ...
    // or: https://abc-123.trycloudflare.com
    const urlRegex = /https?:\/\/[^\s]+trycloudflare\.com[^\s]*/i;
    const hostnameRegex = /hostname=([^\s|]+)/i;

    this.child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);

      if (!this.url) {
        const m1 = text.match(urlRegex);
        if (m1) {
          const foundUrl = m1[0].replace(/\|.*$/, '').trim();
          this.url = foundUrl;
          this.logger.log(`Tunnel URL: ${foundUrl}`);
          if (this.pendingResolver) {
            const resolve = this.pendingResolver;
            this.pendingResolver = null;
            this.rejectResolver = null;
            resolve();
          }
        } else {
          const m2 = text.match(hostnameRegex);
          if (m2) {
            const hostname = m2[1];
            const foundUrl = `https://${hostname}`;
            this.url = foundUrl;
            this.logger.log(`Tunnel URL: ${foundUrl}`);
            if (this.pendingResolver) {
              const resolve = this.pendingResolver;
              this.pendingResolver = null;
              this.rejectResolver = null;
              resolve();
            }
          }
        }
      }
    });

    this.child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      process.stderr.write(text);

      // Collect URL from stderr too (cloudflared logs there).
      if (!this.url) {
        const m1 = text.match(urlRegex);
        if (m1) {
          const foundUrl = m1[0].replace(/\|.*$/, '').trim();
          this.url = foundUrl;
          this.logger.log(`Tunnel URL: ${foundUrl}`);
          if (this.pendingResolver) {
            const resolve = this.pendingResolver;
            this.pendingResolver = null;
            this.rejectResolver = null;
            resolve();
          }
        } else {
          const m2 = text.match(hostnameRegex);
          if (m2) {
            const hostname = m2[1];
            const foundUrl = `https://${hostname}`;
            this.url = foundUrl;
            this.logger.log(`Tunnel URL: ${foundUrl}`);
            if (this.pendingResolver) {
              const resolve = this.pendingResolver;
              this.pendingResolver = null;
              this.rejectResolver = null;
              resolve();
            }
          }
        }
      }
    });

    this.child.on('exit', (code, signal) => {
      this.logger.warn(
        `cloudflared exited (code=${code}, signal=${signal}). Attempts: ${this.reconnectAttempts}/${this.maxReconnectAttempts}`,
      );

      if (this.status === TunnelStatus.STOPPED) return;

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts += 1;
        this.setStatus(TunnelStatus.RECONNECTING);

        const delay = Math.min(1_000 * 2 ** this.reconnectAttempts, 30_000);
        this.logger.log(`Reconnecting in ${delay / 1000}s...`);

        this.reconnectTimer = setTimeout(() => {
          this.reconnect().catch((err) => {
            this.logger.error(`Reconnect failed: ${err}`);
            this.setStatus(TunnelStatus.FAILED);
          });
        }, delay);
      } else {
        this.setStatus(TunnelStatus.FAILED);
        this.url = null;
        this.connectedAt = null;
        if (this.rejectResolver) {
          this.rejectResolver(new Error('max reconnect attempts exceeded'));
          this.pendingResolver = null;
          this.rejectResolver = null;
        }
      }
    });
  }

  private async reconnect(): Promise<void> {
    this.logger.log(
      `Attempting tunnel reconnect (${this.reconnectAttempts})...`,
    );
    this.url = null;

    this.urlPromise = new Promise<string>((resolve, reject) => {
      this.pendingResolver = () => {
        if (this.url) resolve(this.url);
        else reject(new Error('Tunnel stopped before URL resolved'));
      };
      this.rejectResolver = reject;
      setTimeout(() => {
        if (!this.url) {
          reject(new Error('cloudflared URL resolution timed out after 20s'));
          this.pendingResolver = null;
          this.rejectResolver = null;
        }
      }, 20_000);
    });

    const isQuickTunnel =
      !this.config?.cloudflaredToken && !this.config?.cloudflaredHostname;
    const args = isQuickTunnel
      ? this.buildQuickTunnelArgs()
      : this.buildManagedTunnelArgs();
    const bin = this.findCloudflaredBinary();

    this.child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this.wireChildProcess();

    await this.urlPromise;
    this.connectedAt = new Date();
    this.urlPromise = null;
    this.pendingResolver = null;
    this.rejectResolver = null;
  }
}

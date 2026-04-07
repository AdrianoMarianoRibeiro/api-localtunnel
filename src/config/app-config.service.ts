import { Injectable } from '@nestjs/common';
import { AppConfig } from './app-config.types';

@Injectable()
export class AppConfigService {
  get(): AppConfig {
    return {
      host: process.env.APP_HOST ?? '0.0.0.0',
      port: this.parsePort(process.env.APP_PORT, 3000),
      tunnelPort: this.parsePort(process.env.TUNNEL_PORT, 3000),
      tunnelSubdomain: process.env.TUNNEL_SUBDOMAIN ?? 'api-local',
      tunnelHost: process.env.TUNNEL_HOST ?? 'https://localtunnel.me',
      tunnelProvider:
        (process.env.TUNNEL_PROVIDER as AppConfig['tunnelProvider']) ||
        'cloudflare',
      cloudflaredToken: process.env.CLOUDFLARED_TOKEN,
      cloudflaredHostname: process.env.CLOUDFLARED_HOSTNAME,
      cloudflaredBinary: process.env.CLOUDFLARED_BINARY,
    };
  }

  private parsePort(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
      return fallback;
    }
    return parsed;
  }
}

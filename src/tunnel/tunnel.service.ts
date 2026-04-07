import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CloudflareTunnelProvider } from './cloudflare-tunnel.provider';
import { TunnelConfig, TunnelInfo } from './tunnel.types';

@Injectable()
export class TunnelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TunnelService.name);

  constructor(private readonly cloudflare: CloudflareTunnelProvider) {}

  onModuleInit(): void {
    this.cloudflare.onModuleInit();
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }

  async start(config: TunnelConfig): Promise<TunnelInfo> {
    if (config.provider !== 'cloudflare') {
      throw new Error(
        `Unknown tunnel provider: ${config.provider}. Only 'cloudflare' is supported.`,
      );
    }

    this.logger.log('Starting Cloudflare Tunnel provider...');

    try {
      const merged: TunnelConfig = {
        port: config.port,
        provider: 'cloudflare',
        cloudflaredBinary: config.cloudflaredBinary ?? 'cloudflared',
        cloudflaredHostname: config.cloudflaredHostname ?? '',
        cloudflaredToken: config.cloudflaredToken ?? '',
        cloudflaredProtocol: config.cloudflaredProtocol ?? 'http',
        tunnelHost: config.tunnelHost,
        tunnelSubdomain: config.tunnelSubdomain,
      };
      return await this.cloudflare.start(merged);
    } catch (error) {
      this.logger.error(
        `Cloudflare Tunnel failed: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    await this.cloudflare.stop();
    this.logger.log('Tunnel shut down.');
  }

  getInfo(): TunnelInfo {
    return this.cloudflare.getInfo();
  }
}

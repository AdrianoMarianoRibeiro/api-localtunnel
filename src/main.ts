import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { TunnelService } from './tunnel/tunnel.service';
import { TunnelConfig } from './tunnel/tunnel.types';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  const appConfigService = app.get(AppConfigService);
  const appConfig = appConfigService.get();

  await app.listen(appConfig.port, appConfig.host);

  /* --- Tunnel bootstrap (best-effort) --- */
  const startTunnel = process.env.TUNNEL_ENABLED === 'true';
  const tunnelService = app.get(TunnelService);

  if (startTunnel) {
    const tunnelConfig: TunnelConfig = {
      port: appConfig.port,
      provider:
        (process.env.TUNNEL_PROVIDER as TunnelConfig['provider']) ||
        'cloudflare',
      cloudflaredToken: process.env.CLOUDFLARED_TOKEN,
      cloudflaredHostname: process.env.CLOUDFLARED_HOSTNAME,
      cloudflaredBinary: process.env.CLOUDFLARED_BINARY,
      cloudflaredProtocol: 'http',
      tunnelHost: appConfig.tunnelHost,
      tunnelSubdomain: appConfig.tunnelSubdomain,
    };

    try {
      const info = await tunnelService.start(tunnelConfig);
      console.log(
        `[tunnel] ${info.provider} tunnel online at ${info.url ?? 'pending'}`,
      );
    } catch (err) {
      console.error('[tunnel] failed to start:', err);
    }
  }
}

void bootstrap();

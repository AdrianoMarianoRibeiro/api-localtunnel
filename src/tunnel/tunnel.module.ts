import { Module } from '@nestjs/common';
import { CloudflareTunnelProvider } from './cloudflare-tunnel.provider';
import { TunnelService } from './tunnel.service';

@Module({
  providers: [CloudflareTunnelProvider, TunnelService],
  exports: [TunnelService],
})
export class TunnelModule {}

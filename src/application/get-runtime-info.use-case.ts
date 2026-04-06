import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export interface RuntimeInfo {
  message: string;
  localUrl: string;
  requestedTunnelUrl: string;
}

@Injectable()
export class GetRuntimeInfoUseCase {
  constructor(private readonly appConfigService: AppConfigService) {}

  execute(): RuntimeInfo {
    const config = this.appConfigService.get();

    return {
      message: 'API local tunnel is running.',
      localUrl: `http://localhost:${config.port}`,
      requestedTunnelUrl: `${config.tunnelHost.replace(/\/$/, '')}/${config.tunnelSubdomain}`,
    };
  }
}

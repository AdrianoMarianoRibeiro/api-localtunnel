import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { GetRuntimeInfoUseCase } from './application/get-runtime-info.use-case';
import { AppConfigService } from './config/app-config.service';
import { TunnelModule } from './tunnel/tunnel.module';

@Module({
  imports: [TunnelModule],
  controllers: [AppController],
  providers: [GetRuntimeInfoUseCase, AppConfigService],
})
export class AppModule {}

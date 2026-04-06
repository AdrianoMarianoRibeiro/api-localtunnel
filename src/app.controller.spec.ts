import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { GetRuntimeInfoUseCase } from './application/get-runtime-info.use-case';
import { AppConfigService } from './config/app-config.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [GetRuntimeInfoUseCase, AppConfigService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return runtime info', () => {
      expect(appController.getRuntimeInfo()).toEqual({
        message: 'API local tunnel is running.',
        localUrl: 'http://localhost:3000',
        requestedTunnelUrl: 'https://localtunnel.me/api-local',
      });
    });
  });
});

import { Controller, Get } from '@nestjs/common';
import { GetRuntimeInfoUseCase } from './application/get-runtime-info.use-case';
import type { RuntimeInfo } from './application/get-runtime-info.use-case';

@Controller()
export class AppController {
  constructor(private readonly getRuntimeInfoUseCase: GetRuntimeInfoUseCase) {}

  @Get()
  getRuntimeInfo(): RuntimeInfo {
    return this.getRuntimeInfoUseCase.execute();
  }
}

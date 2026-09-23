import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health(): { readonly ok: true } {
    return { ok: true };
  }
}

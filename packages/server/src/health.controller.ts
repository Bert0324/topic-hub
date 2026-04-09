import { Controller, Get } from '@nestjs/common';
import { AiService } from './ai/ai.service';

@Controller('health')
export class HealthController {
  constructor(private readonly aiService: AiService) {}

  @Get()
  check() {
    let ai: 'available' | 'unavailable' | 'disabled';
    const config = this.aiService.getConfig();

    if (!config.enabled) {
      ai = 'disabled';
    } else if (this.aiService.isAvailable()) {
      ai = 'available';
    } else {
      ai = 'unavailable';
    }

    return { status: 'ok', ai };
  }
}

import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root() {
    return { status: 'ok' };
  }

  @Get('ping')
  ping() {
    return { message: 'pong' };
  }
}
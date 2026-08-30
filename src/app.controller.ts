import { readFileSync } from 'fs';
import { join } from 'path';
import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('docs')
  @Header('Content-Type', 'text/html')
  getDocs(): string {
    return readFileSync(join(process.cwd(), 'docs', 'api.html'), 'utf8');
  }
}

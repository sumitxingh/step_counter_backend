import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';
import { StepsService } from './steps.service';
import { SyncStepsDto } from './dto/sync-steps.dto';

@Controller('steps')
export class StepsController {
  constructor(private steps: StepsService) {}

  @Get('today')
  today(@CurrentUser() user: JwtPayload) {
    return this.steps.today(user.sub);
  }

  @Post('sync')
  sync(@CurrentUser() user: JwtPayload, @Body() dto: SyncStepsDto) {
    return this.steps.sync(user.sub, dto);
  }

  @Get('history')
  history(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.steps.history(user.sub, days ? Number(days) : 30);
  }

  @Get('report')
  report(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.steps.report(user.sub, days ? Number(days) : 7);
  }
}

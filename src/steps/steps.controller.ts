import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { parseQueryInt } from '../common/parse-query-int';
import type { JwtPayload } from '../auth/jwt.strategy';
import { StepsService } from './steps.service';
import { SyncStepsDto } from './dto/sync-steps.dto';

const MAX_DAYS = 365;

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
    return this.steps.history(
      user.sub,
      parseQueryInt(days, 30, { max: MAX_DAYS }),
    );
  }

  @Get('report')
  report(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.steps.report(
      user.sub,
      parseQueryInt(days, 7, { max: MAX_DAYS }),
    );
  }
}

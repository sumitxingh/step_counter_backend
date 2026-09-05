import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';
import { StepsService } from './steps.service';
import {
  LEADERBOARD_PERIODS,
  type LeaderboardPeriod,
} from './leaderboard.util';

function parsePeriod(value: string | undefined): LeaderboardPeriod {
  return (LEADERBOARD_PERIODS as readonly string[]).includes(value ?? '')
    ? (value as LeaderboardPeriod)
    : 'week';
}

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private steps: StepsService) {}

  @Get()
  leaderboard(
    @CurrentUser() user: JwtPayload,
    @Query('period') period?: string,
  ) {
    return this.steps.leaderboard(user.sub, parsePeriod(period));
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { parseQueryInt } from '../common/parse-query-int';
import { AdminService } from './admin.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

const MAX_DAYS = 365;

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.admin.listUsers(
      parseQueryInt(page, 1),
      parseQueryInt(limit, 20, { max: 100 }),
      search,
    );
  }

  @Get('users/:id')
  userDetail(@Param('id') id: string) {
    return this.admin.userDetail(id);
  }

  @Patch('users/:id')
  setActive(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.admin.setActive(id, dto.is_active);
  }

  @Get('stats/signups')
  statsSignups(@Query('days') days?: string) {
    return this.admin.statsSignups(parseQueryInt(days, 30, { max: MAX_DAYS }));
  }

  @Get('stats/steps')
  statsSteps(@Query('days') days?: string) {
    return this.admin.statsSteps(parseQueryInt(days, 30, { max: MAX_DAYS }));
  }
}

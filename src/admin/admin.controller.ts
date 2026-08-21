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
import { AdminService } from './admin.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

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
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
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
    return this.admin.statsSignups(days ? Number(days) : 30);
  }

  @Get('stats/steps')
  statsSteps(@Query('days') days?: string) {
    return this.admin.statsSteps(days ? Number(days) : 30);
  }
}

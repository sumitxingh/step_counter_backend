import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { StepEntry } from '../steps/step-entry.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, StepEntry])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

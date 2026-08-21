import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StepEntry } from './step-entry.entity';
import { User } from '../users/user.entity';
import { StepsController } from './steps.controller';
import { StepsService } from './steps.service';

@Module({
  imports: [TypeOrmModule.forFeature([StepEntry, User])],
  controllers: [StepsController],
  providers: [StepsService],
})
export class StepsModule {}

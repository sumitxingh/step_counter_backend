import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { StepEntry } from './step-entry.entity';
import { User } from '../users/user.entity';
import { SyncStepsDto } from './dto/sync-steps.dto';

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class StepsService {
  constructor(
    @InjectRepository(StepEntry) private steps: Repository<StepEntry>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  async today(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const entry = await this.steps.findOne({
      where: { user_id: userId, entry_date: todayDate() },
    });
    return { goal: user.daily_goal_steps, today: entry?.step_count ?? 0 };
  }

  async sync(userId: string, dto: SyncStepsDto) {
    await this.steps.upsert(
      {
        user_id: userId,
        entry_date: dto.entry_date,
        step_count: dto.step_count,
      },
      { conflictPaths: ['user_id', 'entry_date'] },
    );
    return this.steps.findOneByOrFail({
      user_id: userId,
      entry_date: dto.entry_date,
    });
  }

  async history(userId: string, days: number) {
    const entries = await this.steps.find({
      where: {
        user_id: userId,
        entry_date: MoreThanOrEqual(daysAgoDate(days)),
      },
      order: { entry_date: 'DESC' },
    });
    return entries.map(({ entry_date, step_count }) => ({
      entry_date,
      step_count,
    }));
  }

  async report(userId: string, days: number) {
    const entries = await this.steps.find({
      where: {
        user_id: userId,
        entry_date: MoreThanOrEqual(daysAgoDate(days)),
      },
    });
    const days_logged = entries.length;
    const total_steps = entries.reduce((sum, e) => sum + e.step_count, 0);
    return {
      period_days: days,
      days_logged,
      total_steps,
      avg_daily_steps: days_logged ? Math.round(total_steps / days_logged) : 0,
    };
  }
}

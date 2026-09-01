import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { StepEntry } from './step-entry.entity';
import { User } from '../users/user.entity';
import { SyncStepsDto } from './dto/sync-steps.dto';
import {
  LEADERBOARD_LIMIT,
  leaderboardStartDate,
  shapeLeaderboard,
  type LeaderboardPeriod,
  type LeaderboardRawRow,
} from './leaderboard.util';

// Postgres-specific: FILTER, RANK() window, and a CTE. One round-trip returns
// the top N plus the requesting user's own row (even if outside the top N).
const LEADERBOARD_SQL = `
  WITH ranked AS (
    SELECT
      u.id,
      u.full_name,
      COUNT(*) FILTER (WHERE s.step_count >= u.daily_goal_steps)::int AS goal_days,
      COALESCE(SUM(s.step_count), 0)::int AS total_steps,
      RANK() OVER (
        ORDER BY
          COUNT(*) FILTER (WHERE s.step_count >= u.daily_goal_steps) DESC,
          COALESCE(SUM(s.step_count), 0) DESC
      )::int AS rank
    FROM step_entries s
    JOIN users u ON u.id = s.user_id
    WHERE u.is_active = true
      AND u.role <> 'admin'
      AND ($1::date IS NULL OR s.entry_date >= $1::date)
    GROUP BY u.id, u.full_name
  )
  SELECT id, full_name, goal_days, total_steps, rank
  FROM ranked
  WHERE rank <= $2 OR id = $3
  ORDER BY rank
`;

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

  async leaderboard(userId: string, period: LeaderboardPeriod) {
    const start = leaderboardStartDate(period);
    const rows: LeaderboardRawRow[] = await this.steps.query(LEADERBOARD_SQL, [
      start,
      LEADERBOARD_LIMIT,
      userId,
    ]);
    const { top, me } = shapeLeaderboard(rows, userId, LEADERBOARD_LIMIT);
    return { period, generated_at: new Date().toISOString(), top, me };
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

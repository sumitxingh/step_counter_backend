import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { StepEntry } from '../steps/step-entry.entity';

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sanitize(user: User) {
  const { password_hash: _password_hash, ...rest } = user;
  return rest;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(StepEntry) private steps: Repository<StepEntry>,
  ) {}

  async overview() {
    const since7Date = dateOnly(daysAgo(7));
    const since30Date = dateOnly(daysAgo(30));

    const [
      total_users,
      new_users_today,
      new_users_7d,
      new_users_30d,
      active7,
      active30,
      totals,
      avg7,
      goalRows,
    ] = await Promise.all([
      this.users.count(),
      this.users.count({
        where: { created_at: MoreThanOrEqual(startOfToday()) },
      }),
      this.users.count({ where: { created_at: MoreThanOrEqual(daysAgo(7)) } }),
      this.users.count({ where: { created_at: MoreThanOrEqual(daysAgo(30)) } }),
      this.steps
        .createQueryBuilder('s')
        .select('COUNT(DISTINCT s.user_id)', 'count')
        .where('s.entry_date >= :d', { d: since7Date })
        .getRawOne<{ count: string }>(),
      this.steps
        .createQueryBuilder('s')
        .select('COUNT(DISTINCT s.user_id)', 'count')
        .where('s.entry_date >= :d', { d: since30Date })
        .getRawOne<{ count: string }>(),
      this.steps
        .createQueryBuilder('s')
        .select('SUM(s.step_count)', 'total')
        .getRawOne<{ total: string }>(),
      this.steps
        .createQueryBuilder('s')
        .select('AVG(s.step_count)', 'avg')
        .where('s.entry_date >= :d', { d: since7Date })
        .getRawOne<{ avg: string }>(),
      this.steps
        .createQueryBuilder('s')
        .innerJoin(User, 'u', 'u.id = s.user_id')
        .select('COUNT(*)', 'total')
        .addSelect(
          'SUM(CASE WHEN s.step_count >= u.daily_goal_steps THEN 1 ELSE 0 END)',
          'met',
        )
        .where('s.entry_date >= :d', { d: since7Date })
        .getRawOne<{ total: string; met: string }>(),
    ]);

    const goalTotal = Number(goalRows?.total) || 0;
    const goalMet = Number(goalRows?.met) || 0;

    return {
      total_users,
      new_users_today,
      new_users_7d,
      new_users_30d,
      active_users_7d: Number(active7?.count) || 0,
      active_users_30d: Number(active30?.count) || 0,
      total_steps_logged: Number(totals?.total) || 0,
      avg_daily_steps_7d: Math.round(Number(avg7?.avg) || 0),
      goal_completion_rate_7d: goalTotal ? goalMet / goalTotal : 0,
    };
  }

  async listUsers(page: number, limit: number, search?: string) {
    const qb = this.users.createQueryBuilder('u');
    if (search) {
      qb.where('u.full_name ILIKE :s OR u.email ILIKE :s', {
        s: `%${search}%`,
      });
    }
    const [items, total] = await qb
      .orderBy('u.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items: items.map(sanitize), total, page, limit };
  }

  async userDetail(id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const entries = await this.steps.find({
      where: {
        user_id: id,
        entry_date: MoreThanOrEqual(dateOnly(daysAgo(30))),
      },
      order: { entry_date: 'DESC' },
    });
    return {
      ...sanitize(user),
      step_entries: entries.map(({ entry_date, step_count }) => ({
        entry_date,
        step_count,
      })),
    };
  }

  async setActive(id: string, is_active: boolean) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.is_active = is_active;
    return sanitize(await this.users.save(user));
  }

  async statsSignups(days: number) {
    const rows = await this.users
      .createQueryBuilder('u')
      .select("TO_CHAR(u.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('u.created_at >= :d', { d: daysAgo(days) })
      .groupBy("TO_CHAR(u.created_at, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; count: string }>();
    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
  }

  async statsSteps(days: number) {
    const rows = await this.steps
      .createQueryBuilder('s')
      .select('s.entry_date::text', 'date')
      .addSelect('SUM(s.step_count)', 'total_steps')
      .addSelect('COUNT(DISTINCT s.user_id)', 'active_users')
      .where('s.entry_date >= :d', { d: dateOnly(daysAgo(days)) })
      .groupBy('s.entry_date')
      .orderBy('s.entry_date', 'ASC')
      .getRawMany<{
        date: string;
        total_steps: string;
        active_users: string;
      }>();
    return rows.map((r) => ({
      date: r.date,
      total_steps: Number(r.total_steps),
      active_users: Number(r.active_users),
    }));
  }
}

export const LEADERBOARD_PERIODS = ['today', 'week', 'month', 'all'] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export const LEADERBOARD_LIMIT = 50;

// Rolling windows, anchored on "today". null = no lower bound (all-time).
const PERIOD_OFFSET_DAYS: Record<LeaderboardPeriod, number | null> = {
  today: 0,
  week: 6,
  month: 29,
  all: null,
};

export function leaderboardStartDate(
  period: LeaderboardPeriod,
  today: Date = new Date(),
): string | null {
  const back = PERIOD_OFFSET_DAYS[period];
  if (back === null) return null;
  const d = new Date(today);
  d.setDate(d.getDate() - back);
  return d.toISOString().slice(0, 10);
}

export interface LeaderboardRawRow {
  id: string;
  full_name: string;
  goal_days: number;
  total_steps: number;
  rank: number;
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  goal_days: number;
  total_steps: number;
  is_me: boolean;
}

export interface LeaderboardMe {
  rank: number | null;
  name: string | null;
  goal_days: number;
  total_steps: number;
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

export function shapeLeaderboard(
  rows: LeaderboardRawRow[],
  userId: string,
  limit: number = LEADERBOARD_LIMIT,
): { top: LeaderboardRow[]; me: LeaderboardMe } {
  const top = rows
    .filter((r) => r.rank <= limit)
    .map((r) => ({
      rank: r.rank,
      name: firstName(r.full_name),
      goal_days: r.goal_days,
      total_steps: r.total_steps,
      is_me: r.id === userId,
    }));

  const mine = rows.find((r) => r.id === userId);
  const me: LeaderboardMe = mine
    ? {
        rank: mine.rank,
        name: firstName(mine.full_name),
        goal_days: mine.goal_days,
        total_steps: mine.total_steps,
      }
    : { rank: null, name: null, goal_days: 0, total_steps: 0 };

  return { top, me };
}

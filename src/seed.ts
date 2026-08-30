import 'dotenv/config';
import * as assert from 'assert';
import * as bcrypt from 'bcryptjs';
import dataSource from './data-source';
import { User } from './users/user.entity';
import { StepEntry } from './steps/step-entry.entity';
import { Notification } from './notifications/notification.entity';

const PASSWORD = 'password123';

const PEOPLE = [
  { full_name: 'Priya Rao',      email: 'priya.rao@yopmail.com',      role: 'admin', age: 33, gender: 'female', height_cm: 168, weight_kg: 63, daily_goal_steps: 9000,  is_active: true },
  { full_name: 'Aarav Sharma',   email: 'aarav.sharma@yopmail.com',   role: 'user',  age: 29, gender: 'male',   height_cm: 178, weight_kg: 74, daily_goal_steps: 10000, is_active: true },
  { full_name: 'Diya Patel',     email: 'diya.patel@yopmail.com',     role: 'user',  age: 26, gender: 'female', height_cm: 162, weight_kg: 55, daily_goal_steps: 8000,  is_active: true },
  { full_name: 'Rohan Mehta',    email: 'rohan.mehta@yopmail.com',    role: 'user',  age: 34, gender: 'male',   height_cm: 181, weight_kg: 88, daily_goal_steps: 12000, is_active: true },
  { full_name: 'Isha Nair',      email: 'isha.nair@yopmail.com',      role: 'user',  age: 31, gender: 'female', height_cm: 167, weight_kg: 61, daily_goal_steps: 9000,  is_active: true },
  { full_name: 'Kabir Singh',    email: 'kabir.singh@yopmail.com',    role: 'user',  age: 22, gender: 'male',   height_cm: 175, weight_kg: 68, daily_goal_steps: 7500,  is_active: true },
  { full_name: 'Ananya Iyer',    email: 'ananya.iyer@yopmail.com',    role: 'user',  age: 28, gender: 'female', height_cm: 159, weight_kg: 52, daily_goal_steps: 8500,  is_active: true },
  { full_name: 'Vivaan Reddy',   email: 'vivaan.reddy@yopmail.com',   role: 'user',  age: 41, gender: 'male',   height_cm: 172, weight_kg: 79, daily_goal_steps: 6000,  is_active: false },
  { full_name: 'Meera Joshi',    email: 'meera.joshi@yopmail.com',    role: 'user',  age: 37, gender: 'female', height_cm: 164, weight_kg: 70, daily_goal_steps: 8000,  is_active: true },
] as const;

const DAYS_OF_HISTORY = 45;

const dayString = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const round10 = (n: number) => Math.round(n / 10) * 10;

async function seed() {
  await dataSource.initialize();
  const users = dataSource.getRepository(User);
  const steps = dataSource.getRepository(StepEntry);
  const notes = dataSource.getRepository(Notification);

  await dataSource.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');

  const password_hash = await bcrypt.hash(PASSWORD, 10);
  let stepRows = 0;
  let noteRows = 0;

  for (const [i, p] of PEOPLE.entries()) {
    const created_at = daysAgo(6 + i * 6 + Math.floor(rand(0, 4)));
    const user = await users.save(
      users.create({
        ...p,
        password_hash,
        last_login_at: daysAgo(Math.floor(rand(0, 3))),
        created_at,
        updated_at: created_at,
      }),
    );

    if (p.role === 'admin') continue;

    const baseline = p.daily_goal_steps * rand(0.55, 1.15);
    let goalHitDays = 0;

    for (let d = DAYS_OF_HISTORY; d >= 0; d--) {
      if (Math.random() < 0.15) continue;
      const date = daysAgo(d);
      const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
      const step_count = Math.max(
        0,
        round10(baseline * rand(0.45, 1.5) * (weekend ? 1.15 : 1)),
      );
      if (step_count >= p.daily_goal_steps) goalHitDays++;
      await steps.save(
        steps.create({
          user_id: user.id,
          entry_date: dayString(date),
          step_count,
          created_at: date,
          updated_at: date,
        }),
      );
      stepRows++;
    }

    const seededNotes: Partial<Notification>[] = [
      {
        title: 'Weekly summary',
        body: `You logged ${goalHitDays} goal-hitting days in the last 6 weeks. Keep it going!`,
        type: 'summary',
        created_at: daysAgo(Math.floor(rand(1, 3))),
      },
      {
        title: 'Time to move',
        body: "You're behind your usual pace for this time of day. A short walk closes the gap.",
        type: 'reminder',
        created_at: daysAgo(Math.floor(rand(0, 2))),
      },
    ];
    if (goalHitDays > 0) {
      seededNotes.push({
        title: 'Goal reached!',
        body: `You hit your ${p.daily_goal_steps.toLocaleString()}-step goal. Nice work.`,
        type: 'achievement',
        created_at: daysAgo(Math.floor(rand(0, 4))),
      });
    }
    for (const n of seededNotes) {
      await notes.save(notes.create({ ...n, user_id: user.id }));
      noteRows++;
    }
  }

  const userCount = await users.count();
  assert.ok(userCount === PEOPLE.length, `expected ${PEOPLE.length} users, got ${userCount}`);
  assert.ok(stepRows > 0, 'no step entries seeded');
  assert.ok(noteRows > 0, 'no notifications seeded');

  console.log(`Seeded ${userCount} users, ${stepRows} step entries, ${noteRows} notifications.`);
  console.log(`Login with any email below / password "${PASSWORD}":`);
  for (const p of PEOPLE) {
    console.log(`  ${p.role === 'admin' ? '[admin]' : '[user] '} ${p.email}`);
  }
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

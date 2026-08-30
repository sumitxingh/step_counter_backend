import 'dotenv/config';
import * as assert from 'assert';
import * as bcrypt from 'bcryptjs';
import dataSource from './data-source';
import { User } from './users/user.entity';

const email = process.env.ADMIN_EMAIL ?? 'priya.rao@yopmail.com';
const password = process.env.ADMIN_PASSWORD ?? 'password123';
const full_name = process.env.ADMIN_NAME ?? 'Priya Rao';

async function seedAdmin() {
  assert.ok(password.length >= 8, 'ADMIN_PASSWORD must be at least 8 characters');

  await dataSource.initialize();
  const users = dataSource.getRepository(User);
  const password_hash = await bcrypt.hash(password, 10);

  const existing = await users.findOne({ where: { email } });
  const user = await users.save(
    users.create({
      ...(existing ?? {}),
      full_name,
      email,
      password_hash,
      role: 'admin',
      is_active: true,
    }),
  );

  assert.strictEqual(user.role, 'admin', 'admin role was not persisted');

  console.log(`${existing ? 'Promoted' : 'Created'} admin:`);
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log(`  id:       ${user.id}`);
  await dataSource.destroy();
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});

import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from './users/user.entity';
import { StepEntry } from './steps/step-entry.entity';
import { Notification } from './notifications/notification.entity';
import { PasswordResetToken } from './auth/password-reset-token.entity';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, StepEntry, Notification, PasswordResetToken],
  migrations: ['src/migrations/*.ts'],
});

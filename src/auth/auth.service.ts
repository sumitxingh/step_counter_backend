import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { EmailService } from './email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private resetTokens: Repository<PasswordResetToken>,
    private jwt: JwtService,
    private config: ConfigService,
    private email: EmailService,
  ) {}

  private signToken(user: User) {
    return this.jwt.sign({ sub: user.id, role: user.role });
  }

  private sanitize(user: User) {
    const { password_hash: _password_hash, ...rest } = user;
    return rest;
  }

  async register(dto: RegisterDto) {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const password_hash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.save(
      this.users.create({
        full_name: dto.full_name,
        email: dto.email,
        password_hash,
      }),
    );
    return { access_token: this.signToken(user), user: this.sanitize(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.password_hash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.is_active) {
      throw new ForbiddenException('Account is disabled');
    }
    user.last_login_at = new Date();
    await this.users.save(user);
    return { access_token: this.signToken(user), user: this.sanitize(user) };
  }

  async forgotPassword(email: string) {
    const user = await this.users.findOne({ where: { email } });
    if (user) {
      const token = randomBytes(32).toString('hex');
      const token_hash = createHash('sha256').update(token).digest('hex');
      const ttlMin = Number(this.config.get('RESET_TOKEN_TTL_MIN') ?? 30);
      await this.resetTokens.save(
        this.resetTokens.create({
          user_id: user.id,
          token_hash,
          expires_at: new Date(Date.now() + ttlMin * 60_000),
        }),
      );
      try {
        await this.email.sendPasswordReset(user.email, token);
      } catch (err) {
        // email delivery failing shouldn't surface as an API error, and the response
        // must stay identical regardless of email outcome to avoid user enumeration
        this.logger.error('Failed to send password reset email', err);
      }
    }
    return { message: 'If that email exists, a reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const token_hash = createHash('sha256').update(dto.token).digest('hex');
    const record = await this.resetTokens.findOne({ where: { token_hash } });
    if (!record || record.used_at || record.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    const user = await this.users.findOneByOrFail({ id: record.user_id });
    user.password_hash = await bcrypt.hash(dto.new_password, 10);
    await this.users.save(user);
    record.used_at = new Date();
    await this.resetTokens.save(record);
    return { message: 'Password reset successful' };
  }
}

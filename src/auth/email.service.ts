import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor(private config: ConfigService) {}

  // ponytail: constructed lazily so a missing RESEND_API_KEY doesn't block app boot
  private client() {
    this.resend ??= new Resend(this.config.get<string>('RESEND_API_KEY'));
    return this.resend;
  }

  async sendPasswordReset(email: string, token: string) {
    await this.client().emails.send({
      from: 'Step Counter <no-reply@stepcounter.app>',
      to: email,
      subject: 'Reset your password',
      text: `Use this code to reset your password: ${token}`,
    });
  }
}

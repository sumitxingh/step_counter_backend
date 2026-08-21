import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notifications: Repository<Notification>,
  ) {}

  list(userId: string) {
    return this.notifications.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }
}

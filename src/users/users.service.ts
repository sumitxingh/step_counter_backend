import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private users: Repository<User>) {}

  private sanitize(user: User) {
    const { password_hash: _password_hash, ...rest } = user;
    return rest;
  }

  private async findOrFail(id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async me(id: string) {
    return this.sanitize(await this.findOrFail(id));
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const user = await this.findOrFail(id);
    Object.assign(user, dto);
    return this.sanitize(await this.users.save(user));
  }

  async updateGoal(id: string, dto: UpdateGoalDto) {
    const user = await this.findOrFail(id);
    user.daily_goal_steps = dto.daily_goal_steps;
    return this.sanitize(await this.users.save(user));
  }
}

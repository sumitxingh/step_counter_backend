import { IsInt, Min } from 'class-validator';

export class UpdateGoalDto {
  @IsInt()
  @Min(1)
  daily_goal_steps: number;
}

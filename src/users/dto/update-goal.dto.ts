import { IsInt, Max, Min } from 'class-validator';

export class UpdateGoalDto {
  @IsInt()
  @Min(1)
  @Max(100000)
  daily_goal_steps: number;
}

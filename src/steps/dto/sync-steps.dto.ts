import { IsDateString, IsInt, Min } from 'class-validator';

export class SyncStepsDto {
  @IsDateString()
  entry_date: string;

  @IsInt()
  @Min(0)
  step_count: number;
}

import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(150)
  age?: number;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(300)
  height_cm?: number;

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  weight_kg?: number;
}

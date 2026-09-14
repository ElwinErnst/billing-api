import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListApplicationRecordsQueryDto {
  // Narrow to one environment of the app.
  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

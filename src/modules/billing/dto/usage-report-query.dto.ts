import { IsISO8601, IsOptional } from 'class-validator';

export class UsageReportQueryDto {
  // Inclusive lower bound on created_at (ISO 8601). Omit for all-time.
  @IsOptional()
  @IsISO8601()
  from?: string;

  // Exclusive upper bound on created_at (ISO 8601).
  @IsOptional()
  @IsISO8601()
  to?: string;
}

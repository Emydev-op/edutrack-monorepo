import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** `GET /v1/finance/overview` and `/v1/finance/reports/:id`: the working branch and term. */
export class FinanceQueryDto {
  @ApiPropertyOptional({ description: 'Branch id, name or “All branches”' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;

  @ApiPropertyOptional({ description: 'Term id, or a term name with `session`' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  term?: string;

  @ApiPropertyOptional({ example: '2026/2027' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  session?: string;
}

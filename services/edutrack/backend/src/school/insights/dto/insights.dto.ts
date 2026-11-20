import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `GET /v1/dashboard`. School Admin sends the header's working context (names); the Teacher
 * Workspace sends its term id (and, from its dev tools, `simulate`, which the API ignores).
 */
export class DashboardQueryDto {
  @ApiPropertyOptional({
    description: 'School Admin: the term name. Teacher Workspace: the term id.',
    example: 'First Term',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  term?: string;

  @ApiPropertyOptional({ description: 'School Admin: branch name or “All branches”' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;

  @ApiPropertyOptional({ description: 'School Admin: session name (the current session is used)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  session?: string;

  @ApiPropertyOptional({ description: 'Teacher Workspace mock only; ignored' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  simulate?: string;
}

/** `GET /v1/dashboard/finance`: the header's working context. */
export class DashboardFinanceQueryDto {
  @ApiPropertyOptional({ example: 'First Term' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  term?: string;

  @ApiPropertyOptional({ example: 'Main Campus' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;

  @ApiPropertyOptional({ example: '2026/2027' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  session?: string;
}

/** `GET /v1/search`: the command menu. */
export class SearchQueryDto {
  @ApiPropertyOptional({
    description: 'What to look for (2 characters or more)',
    example: 'adeyemi',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Teacher Workspace: the term id' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  term?: string;
}

/** `GET /v1/reports/:id`: the working branch and session, and the report's own filters. */
export class ReportQueryDto {
  @ApiPropertyOptional({ description: 'Branch name or “All branches”', example: 'Main Campus' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;

  @ApiPropertyOptional({ example: '2026/2027' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  session?: string;

  @ApiPropertyOptional({ description: 'Term id (or name) of the current session' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  term?: string;

  @ApiPropertyOptional({ description: 'Section name, or “All”' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  section?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD', example: '2026-09-01' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  from?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD', example: '2026-12-18' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  to?: string;

  @ApiPropertyOptional({ description: 'Report-specific status filter, or “All”' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  status?: string;
}

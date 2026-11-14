import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const PAGE_SIZES = [10, 20, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/**
 * Standard list query: `?page=2&pageSize=20&search=ade`. Extend it for list filters:
 * `class StudentListQuery extends PaginationQueryDto { @IsOptional() @IsEnum(...) status? }`.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ enum: PAGE_SIZES, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsIn(PAGE_SIZES, { message: 'Page size must be 10, 20 or 50.' })
  pageSize: PageSize = 10;

  @ApiPropertyOptional({ description: 'Free-text search' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/** Same shape as the portals' mock `paginate()` and `Paginated<T>` in @edutrack/shared. */
export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

/** `skip`/`take` for Prisma from a pagination query. */
export const toSkipTake = ({ page, pageSize }: Pick<PaginationQueryDto, 'page' | 'pageSize'>) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});

export function paginated<T>(
  data: T[],
  total: number,
  { page, pageSize }: Pick<PaginationQueryDto, 'page' | 'pageSize'>,
): Paginated<T> {
  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

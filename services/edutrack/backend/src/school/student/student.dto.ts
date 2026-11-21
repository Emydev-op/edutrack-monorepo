import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/** `?term=` on the student's homework, materials, results, timetable and attendance. */
export class StudentTermQuery {
  @ApiPropertyOptional({ description: 'Term id (default: the current term)' })
  @IsOptional()
  @IsUUID('all', { message: 'That term doesn’t exist.' })
  term?: string;
}

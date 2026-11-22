import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { CALENDAR_TYPES } from '../calendar.service.js';

/** A school event on the academic calendar (Holiday and Break days have no classes). */
export class CalendarEventDto {
  @ApiProperty({ example: 'Inter-house sports' }) @IsString() @MaxLength(200) title!: string;

  @ApiProperty({ enum: CALENDAR_TYPES })
  @IsIn(CALENDAR_TYPES, { message: 'Choose a type.' })
  type!: (typeof CALENDAR_TYPES)[number];

  @ApiProperty({ example: '2026-11-27' }) @IsString() start!: string;
  @ApiProperty({ example: '2026-11-27' }) @IsString() end!: string;

  @ApiPropertyOptional({ example: 'Everyone' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  audience?: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Lekki Campus',
    description: 'One campus’s event; empty or null: the whole school',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(80)
  branch?: string | null;

  @ApiPropertyOptional({ example: 'No classes. Parents welcome from 9am.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** `PUT /v1/academics/calendar/branch-terms`: a campus's own dates for a term (or back to the term's). */
export class BranchTermDatesDto {
  @ApiProperty({ example: 'Lekki Campus' }) @IsString() @MaxLength(80) branch!: string;
  @ApiProperty({ description: 'The term’s id' }) @IsString() termId!: string;

  @ApiPropertyOptional({ nullable: true, example: '2026-09-21', description: 'null: the term’s' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  start?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-12-18', description: 'null: the term’s' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  end?: string | null;
}

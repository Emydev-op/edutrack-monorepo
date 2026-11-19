import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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

  @ApiPropertyOptional({ example: 'No classes. Parents welcome from 9am.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

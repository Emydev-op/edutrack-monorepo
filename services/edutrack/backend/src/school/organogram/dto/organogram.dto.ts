import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { trim } from '../../../platform/shared/params.js';

/** Add and edit share one form (`PositionPayload`). */
export class PositionDto {
  @ApiProperty({ example: 'Vice Principal (Administration)' })
  @Transform(trim)
  @MaxLength(120, { message: 'Keep the title under 120 characters.' })
  @IsString({ message: 'Enter the position title.' })
  @IsNotEmpty({ message: 'Enter the position title.' })
  title!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'The position this reports to; null only for the top position.',
  })
  @IsOptional()
  @IsString({ message: 'Choose who this position reports to.' })
  parentId?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Staff ids holding the post' })
  @IsOptional()
  @IsString({ each: true, message: 'Holders must be current staff.' })
  @ArrayMaxSize(50)
  @IsArray({ message: 'Holders must be current staff.' })
  holderIds?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Academic Head'], description: 'Role names' })
  @IsOptional()
  @MaxLength(60, { each: true })
  @IsString({ each: true, message: 'One of those roles doesn’t exist.' })
  @ArrayMaxSize(20)
  @IsArray()
  suggestedRoles?: string[];

  @ApiPropertyOptional({ example: 'Curriculum, timetable and assessments.' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(2000, { message: 'Keep the responsibilities under 2,000 characters.' })
  @IsString()
  responsibilities?: string;

  @ApiPropertyOptional({ type: [String], example: ['Results: approve'] })
  @IsOptional()
  @MaxLength(120, { each: true })
  @IsString({ each: true })
  @ArrayMaxSize(30)
  @IsArray()
  approvals?: string[];
}

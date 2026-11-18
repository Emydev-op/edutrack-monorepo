import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class RegisterMarkDto {
  @ApiProperty({ description: 'Student id' })
  @IsString()
  studentId!: string;

  @ApiProperty({ enum: ['Present', 'Absent', 'Late', 'Excused'] })
  @IsString()
  status!: string;

  @ApiPropertyOptional({ description: 'Required for Excused; an optional note for Absent' })
  @IsOptional()
  @MaxLength(500)
  @IsString()
  reason?: string;
}

/** `PUT /v1/class-teacher/register/:date`: a mark for every student on the roll that day. */
export class SaveRegisterDto {
  @ApiProperty({ type: [RegisterMarkDto] })
  @ValidateNested({ each: true })
  @Type(() => RegisterMarkDto)
  @IsArray({ message: 'Mark every student before saving.' })
  marks!: RegisterMarkDto[];
}

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** The uploaded template: .xlsx as base64, or .csv as text. */
export class SubjectImportFileDto {
  @ApiProperty({ example: 'subjects.xlsx' })
  @MaxLength(200)
  @IsString()
  fileName!: string;

  @ApiProperty({ description: '.xlsx: base64 of the file; .csv: its text' })
  @MaxLength(6_000_000, { message: 'That file is too large. Upload up to 300 subjects.' })
  @IsString()
  content!: string;
}

export class SubjectImportRowDto {
  @ApiProperty({ example: 2, description: 'The row in the file (for messages)' })
  @IsInt()
  row!: number;
  @ApiProperty({ example: 'Further Mathematics' }) @MaxLength(120) @IsString() name!: string;
  @ApiProperty({ example: 'FMA', description: 'Blank: one is suggested' })
  @MaxLength(10)
  @IsString()
  code!: string;
  @ApiProperty({ example: 'Senior Secondary', description: 'Blank: shared by every section' })
  @MaxLength(80)
  @IsString()
  section!: string;
  @ApiProperty({ example: 'Science' }) @MaxLength(40) @IsString() category!: string;
  @ApiProperty({ example: 4 }) @IsOptional() periods!: number | string;
  @ApiProperty({ example: 'Active' }) @MaxLength(20) @IsString() status!: string;
}

export class SubjectImportCommitDto {
  @ApiProperty({ type: [SubjectImportRowDto] })
  @ValidateNested({ each: true })
  @Type(() => SubjectImportRowDto)
  @ArrayMaxSize(300)
  @IsArray()
  rows!: SubjectImportRowDto[];
}

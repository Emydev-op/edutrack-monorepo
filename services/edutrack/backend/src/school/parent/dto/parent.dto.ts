import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** `?term=` on a child's results, timetable and attendance. */
export class ParentTermQuery {
  @ApiPropertyOptional({ description: 'Term id (default: the current term)' })
  @IsOptional()
  @IsUUID('all', { message: 'That term doesn’t exist.' })
  term?: string;
}

/** `?child=` on announcements: only what reaches this child's family and class. */
export class ParentAnnouncementsQuery {
  @ApiPropertyOptional({ description: 'Student id' })
  @IsOptional()
  @IsUUID('all', { message: 'That child isn’t linked to your account.' })
  child?: string;
}

/** `POST /v1/parent/children/:id/fees/claims`: "I've paid by bank transfer". */
export class FeeClaimDto {
  @ApiProperty({
    enum: ['all', 'overdue', 'current', 'previous'],
    description: 'What the transfer pays for (one of the `options` from GET …/fees)',
  })
  @IsIn(['all', 'overdue', 'current', 'previous'], { message: 'Choose what you paid for.' })
  option!: 'all' | 'overdue' | 'current' | 'previous';

  @ApiProperty({ example: '2026-11-20', description: 'The day the transfer was made' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Enter the date you made the transfer.' })
  paidOn!: string;

  @ApiProperty({ description: 'The transfer receipt, uploaded first with POST /v1/uploads' })
  @IsUUID('all', { message: 'Attach the transfer receipt.' })
  proofFileId!: string;

  @ApiPropertyOptional({ description: 'The school account paid into (default: the first shown)' })
  @IsOptional()
  @IsUUID('all', { message: 'Choose the account you paid into.' })
  accountId?: string;

  @ApiPropertyOptional({ maxLength: 120, description: 'Narration or bank reference used' })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Keep the reference to 120 characters.' })
  reference?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Keep the note to 500 characters.' })
  note?: string;
}

/** `PATCH /v1/parent/profile`: the parent may change their phone and address only. */
export class ParentProfileDto {
  @ApiPropertyOptional({ example: '0803 555 0161' })
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Enter a Nigerian mobile number, like 0803 412 7781.' })
  phone?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Keep the address to 300 characters.' })
  address?: string;
}

export class ParentPreferenceDto {
  @ApiProperty({ enum: ['results', 'finance', 'assignments', 'register', 'announcements'] })
  @IsString()
  key!: string;
  @ApiProperty() @IsBoolean() inApp!: boolean;
  @ApiProperty() @IsBoolean() email!: boolean;
  @ApiProperty() @IsBoolean() sms!: boolean;
}

/** `PUT /v1/notifications/preferences` from the Parent Portal. */
export class ParentPreferencesDto {
  @ApiProperty({ type: [ParentPreferenceDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ParentPreferenceDto)
  items!: ParentPreferenceDto[];
}

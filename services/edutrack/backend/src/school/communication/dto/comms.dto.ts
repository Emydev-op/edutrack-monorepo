import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { CHANNELS, type Channel } from '../comms-catalog.js';
import { AUDIENCE_KINDS, type AudienceKindLabel } from '../comms-audience.service.js';

export class AudienceDto {
  @ApiProperty({ enum: AUDIENCE_KINDS })
  @IsIn(AUDIENCE_KINDS, { message: 'Choose who the announcement is for.' })
  kind!: AudienceKindLabel;

  @ApiPropertyOptional({ type: [String], description: 'Class arm labels ("JSS 2B") for classes' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  classes?: string[];

  @ApiPropertyOptional({ nullable: true, description: 'null: all branches' })
  @IsOptional()
  @IsString()
  branchId?: string | null;
}

class ChannelsAndAudience {
  @ApiProperty({ type: AudienceDto })
  @ValidateNested()
  @Type(() => AudienceDto)
  audience!: AudienceDto;

  @ApiProperty({ enum: CHANNELS, isArray: true })
  @IsArray()
  @IsIn(CHANNELS, { each: true, message: 'Choose In-app, Email or SMS.' })
  channels!: Channel[];

  @ApiPropertyOptional({ description: 'The SMS version' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  smsText?: string;
}

export class AudiencePreviewDto extends ChannelsAndAudience {}

export class AnnouncementDto extends ChannelsAndAudience {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(1000)
  title!: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(10_000)
  body!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Local "YYYY-MM-DDTHH:mm" when scheduling' })
  @IsOptional()
  @IsString()
  scheduledFor?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Last day it shows, "YYYY-MM-DD"' })
  @IsOptional()
  @IsString()
  expiresOn?: string | null;

  @ApiProperty({ enum: ['draft', 'send', 'schedule'] })
  @IsIn(['draft', 'send', 'schedule'], { message: 'Choose what to do with the announcement.' })
  action!: 'draft' | 'send' | 'schedule';
}

export class WithdrawDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class AnnouncementQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['Draft', 'Scheduled', 'Sent', 'Withdrawn', 'Expired'] })
  @IsOptional()
  @IsIn(['', 'Draft', 'Scheduled', 'Sent', 'Withdrawn', 'Expired'], { message: 'Unknown status.' })
  status?: string;
}

export class DeliveryQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CHANNELS })
  @IsOptional()
  @IsIn(['', ...CHANNELS], { message: 'Unknown channel.' })
  channel?: string;

  @ApiPropertyOptional({ enum: ['Queued', 'Sent', 'Delivered', 'Read', 'Failed'] })
  @IsOptional()
  @IsIn(['', 'Queued', 'Sent', 'Delivered', 'Read', 'Failed'], { message: 'Unknown status.' })
  status?: string;

  @ApiPropertyOptional({ description: 'Event key, e.g. attendance.absent' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  event?: string;
}

export class DeliveryDetailQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CHANNELS })
  @IsOptional()
  @IsIn(['', ...CHANNELS], { message: 'Unknown channel.' })
  channel?: string;

  @ApiPropertyOptional({ enum: ['Queued', 'Sent', 'Delivered', 'Read', 'Failed'] })
  @IsOptional()
  @IsIn(['', 'Queued', 'Sent', 'Delivered', 'Read', 'Failed'], { message: 'Unknown status.' })
  status?: string;
}

export class ChannelTemplateDto {
  @ApiPropertyOptional({ description: 'Email subject / in-app title (empty for SMS)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  subject?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20_000)
  body!: string;
}

/** Only the channels being changed; the others keep their wording. */
export class TemplateDto {
  @ApiPropertyOptional({ type: ChannelTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelTemplateDto)
  'In-app'?: ChannelTemplateDto;

  @ApiPropertyOptional({ type: ChannelTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelTemplateDto)
  Email?: ChannelTemplateDto;

  @ApiPropertyOptional({ type: ChannelTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelTemplateDto)
  SMS?: ChannelTemplateDto;
}

export class QuietHoursDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @IsString()
  start?: string;

  @ApiPropertyOptional({ example: '07:00' })
  @IsOptional()
  @IsString()
  end?: string;
}

export class SenderIdDto {
  @ApiProperty({ example: 'GREENFIELD', description: '3–11 letters or numbers' })
  @IsString({ message: 'Enter the sender ID.' })
  @MaxLength(40)
  name!: string;
}

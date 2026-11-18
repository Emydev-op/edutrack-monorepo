import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';

export const SCHOOL_TICKET_CATEGORIES = [
  'Results & report cards',
  'Fees & payments',
  'Communication',
  'Students & admissions',
  'Account & billing',
  'Something else',
] as const;
export const SCHOOL_TICKET_PRIORITIES = ['Normal', 'High', 'Urgent'] as const;

export class SchoolTicketQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'closed', 'all'], default: 'open' })
  @IsOptional()
  @IsIn(['open', 'closed', 'all'], { message: 'Unknown tab.' })
  tab?: 'open' | 'closed' | 'all';
}

export class TicketAttachmentDto {
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiProperty({ enum: ['image/png', 'image/jpeg', 'application/pdf'] }) @IsString() type!: string;
  @ApiProperty() @IsNumber() bytes!: number;
  @ApiProperty({
    description: 'A base64 `data:` URL (PNG, JPG or PDF, 10 MB at most)',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  dataUrl!: string | null;
}

class WithAttachments {
  @ApiPropertyOptional({ type: [TicketAttachmentDto], maxItems: 3 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3, { message: 'Attach up to 3 files.' })
  @ValidateNested({ each: true })
  @Type(() => TicketAttachmentDto)
  attachments?: TicketAttachmentDto[];
}

export class NewSchoolTicketDto extends WithAttachments {
  @ApiProperty({ enum: SCHOOL_TICKET_CATEGORIES })
  @IsIn(SCHOOL_TICKET_CATEGORIES, { message: 'Choose a category.' })
  category!: string;

  @ApiPropertyOptional({ enum: SCHOOL_TICKET_PRIORITIES, default: 'Normal' })
  @IsOptional()
  @IsIn(SCHOOL_TICKET_PRIORITIES, { message: 'Choose a priority.' })
  priority?: string;

  @ApiProperty({ maxLength: 120 }) @IsString() subject!: string;
  @ApiProperty({ minLength: 20, maxLength: 5000 }) @IsString() description!: string;

  @ApiPropertyOptional({ description: 'A closed ticket this follows up, e.g. SUP-1042' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  followUpOf?: string;
}

export class SchoolTicketReplyDto extends WithAttachments {
  @ApiProperty({ maxLength: 5000 }) @IsString() text!: string;
}

export class ConfirmTicketDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5, nullable: true })
  @IsOptional()
  @IsInt({ message: 'Rate the support from 1 to 5.' })
  @Min(1, { message: 'Rate the support from 1 to 5.' })
  @Max(5, { message: 'Rate the support from 1 to 5.' })
  rating?: number | null;
}

export class TicketReasonDto {
  @ApiProperty() @IsString() reason!: string;
}

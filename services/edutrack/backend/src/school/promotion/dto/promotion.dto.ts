import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export const PROMOTION_DECISIONS = [
  'Promote',
  'Repeat',
  'Graduate',
  'Transfer',
  'Withdraw',
] as const;

/** One student's decision (School Admin's `PromotionDecisionInput`). */
export class PromotionDecisionInputDto {
  @ApiProperty({ description: 'Student id' })
  @IsString()
  studentId!: string;

  @ApiProperty({ enum: PROMOTION_DECISIONS, nullable: true, description: 'Null: not decided yet' })
  @IsOptional()
  @IsIn(PROMOTION_DECISIONS, { message: 'Choose Promote, Repeat, Graduate, Transfer or Withdraw.' })
  decision!: (typeof PROMOTION_DECISIONS)[number] | null;

  @ApiPropertyOptional({
    description: 'Why, when the decision goes against the promotion rule (up to 500 characters)',
  })
  @IsOptional()
  @MaxLength(500, { message: 'Keep the reason under 500 characters.' })
  @IsString()
  reason?: string;
}

/** `PUT /v1/academics/promotion/:classId`. */
export class SavePromotionDto {
  @ApiProperty({ type: [PromotionDecisionInputDto] })
  @ValidateNested({ each: true })
  @Type(() => PromotionDecisionInputDto)
  @IsArray({ message: 'Send the decisions to save.' })
  decisions!: PromotionDecisionInputDto[];
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { SUBSCRIPTION_STATUS_LABEL } from '../../shared/format.js';

const LABELS = Object.values(SUBSCRIPTION_STATUS_LABEL);

export class SubscriptionListQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LABELS })
  @IsOptional()
  @IsIn(LABELS, { message: 'Unknown status.' })
  status?: string;
}

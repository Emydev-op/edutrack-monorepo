import { ApiProperty } from '@nestjs/swagger';
import { TimelineEntryDto } from '../../users/dto/users.responses.js';

export class PositionResponseDto {
  @ApiProperty({ example: '0193a7c1-…' })
  id!: string;

  @ApiProperty({ example: 'Vice Principal (Academics)' })
  title!: string;

  @ApiProperty({ type: String, nullable: true, example: '0193a7c1-…' })
  parentId!: string | null;

  @ApiProperty({ type: [String], description: 'Staff ids' })
  holderIds!: string[];

  @ApiProperty({ type: [String], example: ['Mrs. Chioma Eze'] })
  holderNames!: string[];

  @ApiProperty({ type: [String], example: ['Academic Head', 'Teacher'] })
  suggestedRoles!: string[];

  @ApiProperty({ example: 'Curriculum, timetable and assessments.' })
  responsibilities!: string;

  @ApiProperty({ type: [String], example: ['Results: approve', 'Promotion: decide'] })
  approvals!: string[];
}

export class OrganogramResponseDto {
  @ApiProperty({ type: [PositionResponseDto] })
  positions!: PositionResponseDto[];

  @ApiProperty({ type: [TimelineEntryDto] })
  history!: TimelineEntryDto[];
}

export class PositionRemovedDto {
  @ApiProperty({ example: true })
  ok!: true;
}

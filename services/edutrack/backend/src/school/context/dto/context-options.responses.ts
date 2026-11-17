import { ApiProperty } from '@nestjs/swagger';

/** Swagger shape of School Admin's `ContextOptions`. */

export class ContextBranchResponse {
  @ApiProperty({ example: 'Main Campus' })
  name!: string;

  @ApiProperty({ example: 'Active', enum: ['Active', 'Inactive'] })
  status!: string;
}

export class ContextSessionResponse {
  @ApiProperty({ example: '2026/2027' })
  name!: string;

  @ApiProperty({ example: 'Active', enum: ['Upcoming', 'Active', 'Closing', 'Closed', 'Archived'] })
  status!: string;
}

export class WorkingContextResponse {
  @ApiProperty({ example: 'Main Campus' })
  branch!: string;

  @ApiProperty({ example: '2026/2027', description: 'Empty until the school creates a session' })
  session!: string;

  @ApiProperty({ example: 'First Term', description: 'Empty until the school creates a session' })
  term!: string;
}

export class ContextOptionsResponse {
  @ApiProperty({
    type: [ContextBranchResponse],
    description: 'Active branches, plus “All branches” when there are several',
  })
  branches!: ContextBranchResponse[];

  @ApiProperty({ type: [ContextSessionResponse], description: 'Newest first, archived left out' })
  sessions!: ContextSessionResponse[];

  @ApiProperty({ example: ['First Term', 'Second Term', 'Third Term'] })
  terms!: string[];

  @ApiProperty({ type: WorkingContextResponse, description: 'Where a new sign-in starts' })
  defaults!: WorkingContextResponse;
}

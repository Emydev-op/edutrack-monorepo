import { ApiProperty } from '@nestjs/swagger';
import { RouteTargetResponse } from '../../academics/dto/academics.responses.js';

/** Swagger shapes of School Admin's `SetupStep` and `SetupProgress`. */

export class SetupStepResponse {
  @ApiProperty({ example: 'classes-arms' })
  id!: string;

  @ApiProperty({
    example: 'Academic structure',
    enum: ['Foundation', 'Academic structure', 'People', 'Operations'],
  })
  group!: string;

  @ApiProperty({ example: 'Classes & Arms' })
  name!: string;

  @ApiProperty({ example: '48 arms across 25 class levels' })
  description!: string;

  @ApiProperty({
    type: RouteTargetResponse,
    example: { name: 'classes', query: { from: 'setup' } },
  })
  to!: RouteTargetResponse;

  @ApiProperty({ example: true })
  done!: boolean;

  @ApiProperty({ example: true })
  required!: boolean;

  @ApiProperty({ example: null, nullable: true, type: String })
  prerequisite!: string | null;

  @ApiProperty({
    example: true,
    description: 'Described from the school’s data and completed from its own screen',
  })
  auto!: boolean;
}

export class SetupProgressResponse {
  @ApiProperty({
    example:
      'Steps adapt to your offering. Greenfield Academy runs Nursery, Primary, Junior Secondary and Senior Secondary, so nursery grading descriptors are included.',
  })
  intro!: string;

  @ApiProperty({ type: [SetupStepResponse] })
  steps!: SetupStepResponse[];

  @ApiProperty({ example: false, description: 'Setup was marked complete' })
  finished!: boolean;

  @ApiProperty({ example: false, description: 'A newly provisioned school' })
  onboarding!: boolean;

  @ApiProperty({
    example: true,
    description:
      'School profile confirmed, the current session (with terms) started, classes and arms set. ' +
      'Until then School Admin keeps the admins in the Setup Center.',
  })
  foundationComplete!: boolean;

  @ApiProperty({ example: ['school-profile', 'academic-session', 'classes-arms'] })
  foundationSteps!: string[];
}

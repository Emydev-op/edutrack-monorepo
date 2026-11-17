import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One line of a record's history, as the School Admin timelines show it. */
export class TimelineEntryResponse {
  @ApiProperty({ example: '0193a3f2-6c1e-7a51-9d1a-2f4c8b6e7a10' })
  id!: string;

  @ApiProperty({ example: 'Updated school details' })
  title!: string;

  @ApiPropertyOptional({ example: 'Adaeze Okonkwo · motto, logo' })
  detail?: string;

  @ApiProperty({ example: '2 Sep 2026' })
  when!: string;
}

export class FileRefResponse {
  @ApiProperty({ example: 'crest.png' })
  name!: string;

  @ApiProperty({ example: '84 KB' })
  size!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Images: a signed link, valid for an hour. Documents: null.',
    example: 'https://storage.example/schools/…/logo/….png?X-Amz-Signature=…',
  })
  dataUrl!: string | null;
}

export class SchoolPlanResponse {
  @ApiProperty({ example: 'Growth' })
  name!: string;

  @ApiProperty({ example: 1248, description: 'Students on the roll now.' })
  students!: number;

  @ApiProperty({ example: 1500, description: '0 when the plan has no limit.' })
  studentLimit!: number;

  @ApiProperty({ example: 5, description: 'Includes inactive branches. 999 when unlimited.' })
  branchLimit!: number;

  @ApiProperty({ example: '31 Aug 2027' })
  renews!: string;
}

export class SchoolProfileResponse {
  @ApiProperty({ example: 'Greenfield Academy' })
  name!: string;

  @ApiProperty({ example: 'Greenfield Academy Limited', description: 'Changed through support.' })
  legalName!: string;

  @ApiProperty({ example: 'Private' })
  ownership!: string;

  @ApiProperty({
    type: [String],
    example: ['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'],
  })
  sections!: string[];

  @ApiProperty({ example: '#9B403C' })
  brandColor!: string;

  @ApiProperty({ example: 'Knowledge · Character · Service' })
  motto!: string;

  @ApiProperty({ example: '2009' })
  founded!: string;

  @ApiProperty({ type: FileRefResponse, nullable: true })
  logo!: FileRefResponse | null;

  @ApiProperty({ example: 'info@greenfieldacademy.ng' })
  email!: string;

  @ApiProperty({ example: '0803 555 0142' })
  phone!: string;

  @ApiProperty({ example: 'greenfieldacademy.ng' })
  website!: string;

  @ApiProperty({ example: '14 Adeniyi Jones Avenue' })
  street!: string;

  @ApiProperty({ example: 'Ikeja' })
  city!: string;

  @ApiProperty({ example: 'Ikeja' })
  lga!: string;

  @ApiProperty({ example: 'Lagos' })
  state!: string;

  @ApiProperty({ example: 'Lagos State Ministry of Basic & Secondary Education' })
  approvingBody!: string;

  @ApiProperty({ example: 'LSMOE/PS/2009/0418' })
  approvalNumber!: string;

  @ApiProperty({ example: 'RC 1184206' })
  cacNumber!: string;

  @ApiProperty({ type: FileRefResponse, nullable: true })
  certificate!: FileRefResponse | null;

  @ApiProperty({ type: SchoolPlanResponse })
  plan!: SchoolPlanResponse;

  @ApiProperty({ example: '2 Sep 2026' })
  updatedAt!: string;

  @ApiProperty({ type: [TimelineEntryResponse] })
  history!: TimelineEntryResponse[];
}

import { ApiProperty } from '@nestjs/swagger';
import type { PublicSchool } from '@edutrack/shared';

/** Swagger shape of `PublicSchool`. */
export class PublicSchoolDto implements PublicSchool {
  @ApiProperty({ example: 'greenfield' })
  slug!: string;

  @ApiProperty({ example: 'Greenfield Academy' })
  name!: string;

  @ApiProperty({ example: 'GA' })
  initials!: string;

  @ApiProperty({ example: 'Knowledge and Character', nullable: true, type: String })
  motto!: string | null;

  @ApiProperty({ example: '#1F6FEB' })
  brandColor!: string;

  @ApiProperty({ nullable: true, type: String, description: 'Signed link, valid for an hour.' })
  logoUrl!: string | null;

  @ApiProperty({ description: 'False while the school is suspended.' })
  available!: boolean;
}

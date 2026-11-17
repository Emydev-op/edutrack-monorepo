import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../../platform/shared/params.js';

/**
 * A file as the School Admin screens hold it. `dataUrl` is a `data:` URL for a new upload; for the
 * stored file it is the link the API gave (or null), which leaves the file as it is.
 */
export class FileRefDto {
  @ApiProperty({ example: 'crest.png' })
  @MaxLength(200)
  @IsString({ message: 'Choose a file.' })
  name!: string;

  @ApiProperty({ example: '84 KB' })
  @MaxLength(20)
  @IsString()
  size!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'A `data:image/png;base64,…` upload, or the link the API returned.',
  })
  @IsOptional()
  @IsString()
  dataUrl?: string | null;
}

/** PUT /school/profile. Legal name, ownership, sections and plan are set by EduTrack. */
export class UpdateSchoolProfileDto {
  @ApiProperty({ example: 'Greenfield Academy' })
  @Transform(trim)
  @MinLength(3, { message: 'The name must be at least 3 characters.' })
  @MaxLength(120, { message: 'Keep the name under 120 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Enter the name parents and staff will see.' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Set by EduTrack; sending a different value is refused (LEGAL_NAME_LOCKED).',
  })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ example: 'Knowledge · Character · Service' })
  @Transform(trim)
  @IsOptional()
  @MaxLength(80, { message: 'Keep the motto under 80 characters.' })
  @IsString()
  motto?: string;

  @ApiPropertyOptional({ example: '2009', description: 'A year, or empty.' })
  @Transform(trim)
  @IsOptional()
  @Matches(/^(\d{4})?$/, { message: 'Enter a year like 2009.' })
  @IsString()
  founded?: string;

  @ApiPropertyOptional({ example: '#9B403C', description: 'Portals are themed with it.' })
  @Transform(trim)
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Choose a colour like #1F6FEB.' })
  @IsString()
  brandColor?: string;

  @ApiPropertyOptional({ type: FileRefDto, nullable: true, description: 'PNG or JPG, 1 MB.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => FileRefDto)
  logo?: FileRefDto | null;

  @ApiProperty({ example: 'info@greenfieldacademy.ng' })
  @Transform(trim)
  @MaxLength(120, { message: 'Enter a valid school email.' })
  @IsString({ message: 'Enter a valid school email.' })
  email!: string;

  @ApiProperty({ example: '0803 555 0142' })
  @Transform(trim)
  @MaxLength(20, { message: 'Enter a Nigerian phone number.' })
  @IsString({ message: 'Enter a Nigerian phone number.' })
  phone!: string;

  @ApiPropertyOptional({ example: 'greenfieldacademy.ng' })
  @Transform(trim)
  @IsOptional()
  @Matches(/^((https?:\/\/)?[\w-]+(\.[\w-]+)+(\/.*)?)?$/, {
    message: 'Enter a valid web address, like greenfieldacademy.ng.',
  })
  @MaxLength(200)
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: '14 Adeniyi Jones Avenue' })
  @Transform(trim)
  @IsOptional()
  @MaxLength(200, { message: 'Keep the address under 200 characters.' })
  @IsString()
  street?: string;

  @ApiPropertyOptional({ example: 'Ikeja' })
  @Transform(trim)
  @IsOptional()
  @MaxLength(80, { message: 'Keep the town under 80 characters.' })
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Ikeja' })
  @Transform(trim)
  @IsOptional()
  @MaxLength(80, { message: 'Choose an LGA in the chosen state.' })
  @IsString()
  lga?: string;

  @ApiProperty({ example: 'Lagos' })
  @Transform(trim)
  @IsString({ message: 'Choose a Nigerian state.' })
  state!: string;

  @ApiPropertyOptional({ example: 'Lagos State Ministry of Basic & Secondary Education' })
  @Transform(trim)
  @IsOptional()
  @MaxLength(200, { message: 'Keep the approving body under 200 characters.' })
  @IsString()
  approvingBody?: string;

  @ApiProperty({ example: 'LSMOE/PS/2009/0418' })
  @Transform(trim)
  @MaxLength(80, { message: 'Keep the approval number under 80 characters.' })
  @IsString({ message: 'Enter the approval number.' })
  @IsNotEmpty({ message: 'Enter the approval number.' })
  approvalNumber!: string;

  @ApiPropertyOptional({ example: 'RC 1184206' })
  @Transform(trim)
  @IsOptional()
  @Matches(/^((RC|BN)\s?\d{4,8})?$/i, { message: 'CAC numbers look like RC 1234567.' })
  @IsString()
  cacNumber?: string;

  @ApiPropertyOptional({ type: FileRefDto, nullable: true, description: 'PDF, PNG or JPG, 5 MB.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => FileRefDto)
  certificate?: FileRefDto | null;
}

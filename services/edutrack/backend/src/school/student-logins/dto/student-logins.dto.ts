import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { trim } from '../../../platform/shared/params.js';

/** `GET /v1/students/logins`. */
export class StudentLoginsQueryDto {
  @ApiPropertyOptional({ example: 'JSS 2B', description: 'A class ("JSS 2B") or level ("JSS 2")' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(60)
  @IsString()
  className?: string;
}

/**
 * `POST /v1/students/logins`: logins for the students in sections with Student Portal logins on —
 * everyone, one class or level (`className`), or the listed students.
 */
export class CreateStudentLoginsDto {
  @ApiPropertyOptional({ example: 'JSS 2B', description: 'A class ("JSS 2B") or level ("JSS 2")' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(60)
  @IsString()
  className?: string;

  @ApiPropertyOptional({ type: [String], description: 'Only these students' })
  @IsOptional()
  @ArrayMaxSize(500, { message: 'Choose up to 500 students at a time.' })
  @IsString({ each: true, message: 'Choose the students.' })
  @IsArray({ message: 'Choose the students.' })
  studentIds?: string[];

  @ApiPropertyOptional({
    default: false,
    description:
      'Also issue new one-time passwords to students who already have a login (lost slips). ' +
      'Their old password stops working and they are signed out.',
  })
  @IsOptional()
  @IsBoolean({ message: 'Choose whether to replace existing passwords.' })
  reissue?: boolean;
}

export class StudentLoginSectionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Junior Secondary' }) name!: string;
  @ApiProperty({ example: 'JSS' }) code!: string;
  @ApiProperty({ example: true }) studentLogins!: boolean;
}

export const LOGIN_STATES = ['No login', 'Not signed in yet', 'Active', 'Closed'] as const;

export class StudentLoginRowDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Chidi Okafor' }) name!: string;
  @ApiProperty({ example: 'GFA/2024/0142' }) admissionNo!: string;
  @ApiProperty({ example: 'JSS 2B' }) className!: string;
  @ApiProperty({ example: 'Junior Secondary' }) section!: string;
  @ApiProperty({ example: true, description: 'Their section has Student Portal logins on' })
  enabled!: boolean;
  @ApiProperty({ enum: LOGIN_STATES, example: 'Not signed in yet' }) login!: string;
}

export class StudentLoginCountsDto {
  @ApiProperty({ example: 412, description: 'Current students in sections with logins on' })
  eligible!: number;
  @ApiProperty({ example: 380 }) withLogin!: number;
  @ApiProperty({ example: 32 }) withoutLogin!: number;
}

export class StudentLoginsViewDto {
  @ApiProperty({ type: [StudentLoginSectionDto] }) sections!: StudentLoginSectionDto[];
  @ApiProperty({ type: [StudentLoginRowDto] }) students!: StudentLoginRowDto[];
  @ApiProperty({ type: StudentLoginCountsDto }) counts!: StudentLoginCountsDto;
}

export class LoginSlipDto {
  @ApiProperty() studentId!: string;
  @ApiProperty({ example: 'Chidi Okafor' }) name!: string;
  @ApiProperty({ example: 'JSS 2B' }) className!: string;
  @ApiProperty({ example: 'GFA/2024/0142' }) admissionNo!: string;
  @ApiProperty({ example: 'Greenfield Academy' }) schoolName!: string;
  @ApiProperty({ example: 'https://greenfield.edutrack.ng/student' }) signInAddress!: string;
  @ApiProperty({
    example: 'KTMB-4827',
    description: 'Shown once. It must be changed at the first sign-in.',
  })
  oneTimePassword!: string;
}

export class SkippedStudentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Ada Okafor' }) name!: string;
  @ApiProperty({ example: 'Student logins are off for Primary.' }) reason!: string;
}

export class StudentLoginsResultDto {
  @ApiProperty({ example: 38 }) created!: number;
  @ApiProperty({ example: 2, description: 'Existing logins given a new one-time password' })
  reissued!: number;
  @ApiProperty({ type: [SkippedStudentDto] }) skipped!: SkippedStudentDto[];
  @ApiProperty({ example: '17 Nov 2026' }) issuedOn!: string;
  @ApiProperty({ type: [LoginSlipDto] }) slips!: LoginSlipDto[];
}

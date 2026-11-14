import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
} from '../../alerts/platform-alerts.service.js';
import { trim } from '../../shared/params.js';

export class UpdateProfileDto {
  @ApiProperty()
  @Transform(trim)
  @MaxLength(60, { message: 'Keep your first name under 60 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Enter your first name.' })
  firstName!: string;

  @ApiProperty()
  @Transform(trim)
  @MaxLength(60, { message: 'Keep your last name under 60 characters.' })
  @IsString()
  @IsNotEmpty({ message: 'Enter your last name.' })
  lastName!: string;

  @ApiPropertyOptional({ example: '0803 412 7781', description: 'Empty for none' })
  @IsOptional()
  @Transform(trim)
  @MaxLength(20)
  @IsString()
  phone?: string;
}

export class AvatarDto {
  @ApiProperty({
    nullable: true,
    description:
      'A data URL (`data:image/png;base64,…`, JPG or PNG, up to 2 MB), or null to remove',
  })
  @ValidateIf((_, value) => value !== null)
  // Base64 of 2 MB is about 2.8 million characters.
  @MaxLength(3_000_000, { message: 'The photo is larger than 2 MB.' })
  @IsString({ message: 'Use a JPG or PNG image.' })
  avatarUrl!: string | null;
}

export class NotificationPreferenceDto {
  @ApiProperty({ example: 'Subscription expiring' })
  @MaxLength(60)
  @IsString()
  @IsNotEmpty()
  event!: string;

  @ApiProperty({ enum: NOTIFICATION_CHANNELS })
  @IsIn(NOTIFICATION_CHANNELS, { message: 'Unknown channel.' })
  channel!: NotificationChannel;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class SecuritySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  newDeviceAlerts?: boolean;

  @ApiPropertyOptional({ description: 'Can’t be turned on until approved IP ranges can be added' })
  @IsOptional()
  @IsBoolean()
  ipRestriction?: boolean;
}

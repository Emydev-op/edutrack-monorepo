import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ACADEMIC_LABEL,
  FINANCE_LABEL,
  NUMBERING_LABEL,
  ruleProblem,
  SETTINGS_AREAS,
  type SettingsArea,
} from '../settings-view.js';

const onOrOff = (label: string) => ({ message: `${label} must be on or off.` });
const ruleMessage = (key: Parameters<typeof ruleProblem>[0]) => ({
  message: ruleProblem(key, Number.NaN)!,
});

export class NumberingDto {
  @ApiPropertyOptional({ example: 'STU-[YYYY]-[####]' })
  @IsOptional()
  @IsString({ message: `${NUMBERING_LABEL.admission}: Enter a format.` })
  @MaxLength(100, {
    message: `${NUMBERING_LABEL.admission}: Keep the format to 24 characters or fewer.`,
  })
  admission?: string;

  @ApiPropertyOptional({ example: 'GFA-ST-[####]' })
  @IsOptional()
  @IsString({ message: `${NUMBERING_LABEL.staff}: Enter a format.` })
  @MaxLength(100, {
    message: `${NUMBERING_LABEL.staff}: Keep the format to 24 characters or fewer.`,
  })
  staff?: string;
}

export class AcademicPolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean(onOrOff(ACADEMIC_LABEL.reweightExempt))
  reweightExempt?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean(onOrOff(ACADEMIC_LABEL.promotionSuggestions))
  promotionSuggestions?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean(onOrOff(ACADEMIC_LABEL.blockPromotionOnFees))
  blockPromotionOnFees?: boolean;
}

export class FinanceTogglesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean(onOrOff(FINANCE_LABEL.allowPartial))
  allowPartial?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean(onOrOff(FINANCE_LABEL.autoSibling))
  autoSibling?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean(onOrOff(FINANCE_LABEL.verifyTransfers))
  verifyTransfers?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean(onOrOff(FINANCE_LABEL.holdReportCards))
  holdReportCards?: boolean;
}

export class SignInRulesDto {
  @ApiPropertyOptional({ minimum: 5, maximum: 240, example: 30 })
  @IsOptional()
  @IsNumber({}, ruleMessage('idleTimeoutMinutes'))
  idleTimeoutMinutes?: number;

  @ApiPropertyOptional({ minimum: 3, maximum: 10, example: 5 })
  @IsOptional()
  @IsNumber({}, ruleMessage('lockoutAttempts'))
  lockoutAttempts?: number;

  @ApiPropertyOptional({ minimum: 5, maximum: 1440, example: 15 })
  @IsOptional()
  @IsNumber({}, ruleMessage('lockoutMinutes'))
  lockoutMinutes?: number;

  @ApiPropertyOptional({ description: '30–365, or 0 for never', example: 90 })
  @IsOptional()
  @IsNumber({}, ruleMessage('passwordExpiryDays'))
  passwordExpiryDays?: number;
}

export class SettingsHistoryQuery {
  @ApiPropertyOptional({ enum: SETTINGS_AREAS })
  @IsOptional()
  @IsIn(['', ...SETTINGS_AREAS], { message: 'Unknown settings area.' })
  area?: SettingsArea | '';
}

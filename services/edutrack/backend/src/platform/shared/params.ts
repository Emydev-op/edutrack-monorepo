import { Injectable, type PipeTransform } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Route ids are UUIDs. Anything else can't name a record, so it answers 404 with the record's
 * own message (like a well-formed id that doesn't exist) instead of a 400 about the format.
 */
@Injectable()
export class RecordIdPipe implements PipeTransform<string, string> {
  constructor(private readonly message: string) {}

  transform(value: string): string {
    if (!UUID.test(value)) throw AppException.notFound(this.message);
    return value.toLowerCase();
  }
}

export const isUuid = (value: string) => UUID.test(value);

export const SCHOOL_NOT_FOUND = 'That school doesn’t exist.';
export const PLAN_NOT_FOUND = 'That plan doesn’t exist.';

export const schoolId = new RecordIdPipe(SCHOOL_NOT_FOUND);
export const planId = new RecordIdPipe(PLAN_NOT_FOUND);

/** class-transformer helpers for DTOs. */
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

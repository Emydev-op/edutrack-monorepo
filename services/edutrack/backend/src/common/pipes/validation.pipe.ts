import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { AppException } from '../errors/app.exception.js';

/** Flattens nested class-validator errors to `{ 'guardians.0.phone': 'message' }`. */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
  out: Record<string, string> = {},
): Record<string, string> {
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const messages = Object.values(error.constraints ?? {});
    if (messages.length && !(path in out)) out[path] = messages[0]!;
    if (error.children?.length) flattenValidationErrors(error.children, path, out);
  }
  return out;
}

/**
 * The global validation pipe: strips nothing silently (unknown properties are a 422), transforms
 * payloads into DTO instances, and answers 422 with `fields` keyed by property path.
 */
export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: true,
    exceptionFactory: (errors) => {
      const fields = flattenValidationErrors(errors);
      const count = Object.keys(fields).length;
      return AppException.validation(
        fields,
        count === 1 ? Object.values(fields)[0] : 'Some details need your attention.',
      );
    },
  });
}

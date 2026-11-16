import {
  BadRequestException,
  HttpStatus,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { TenantContextError, TenantMismatchError } from '../tenancy/tenant.errors.js';
import { RequestContext } from './context/request-context.js';
import { AppException } from './errors/app.exception.js';
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js';
import { redactPath } from './logging/request-context.middleware.js';
import { paginated, PaginationQueryDto, toSkipTake } from './pagination/pagination.js';
import { createValidationPipe } from './pipes/validation.pipe.js';
import { IsEmail, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

function run(exception: unknown) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  RequestContext.run({ requestId: 'req-1' }, () =>
    new AllExceptionsFilter().catch(exception, host),
  );
  return res;
}

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('db', { code, clientVersion: '7', meta });

describe('AllExceptionsFilter', () => {
  /** Status, code and message of a failure, for compact assertions. */
  const answer = (exception: unknown) => {
    const res = run(exception);
    const body = res.body as { success: boolean; message: string; error: { code: string } };
    return {
      status: res.statusCode,
      success: body.success,
      code: body.error.code,
      message: body.message,
    };
  };

  it('answers { success: false, message, error: { code, fields }, requestId }', () => {
    const res = run(AppException.validation({ 'guardians.0.phone': 'Enter a phone number.' }));
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({
      success: false,
      message: 'Enter a phone number.',
      error: { code: 'VALIDATION', fields: { 'guardians.0.phone': 'Enter a phone number.' } },
      requestId: 'req-1',
    });
  });

  it('maps Nest HTTP exceptions to default codes', () => {
    expect(answer(new NotFoundException('Nope'))).toEqual({
      status: 404,
      success: false,
      code: 'NOT_FOUND',
      message: 'Nope',
    });
    expect(answer(new BadRequestException(['a', 'b']))).toMatchObject({
      message: 'a, b',
      code: 'BAD_REQUEST',
    });
  });

  it('maps Prisma errors to readable conflicts and not-founds', () => {
    expect(answer(prismaError('P2002', { target: ['school_id', 'code'] }))).toMatchObject({
      status: 409,
      code: 'DUPLICATE',
      message: 'A record with the same code already exists.',
    });
    expect(
      answer(
        prismaError('P2002', {
          driverAdapterError: { cause: { constraint: { fields: ['staffNumber'] } } },
        }),
      ),
    ).toMatchObject({ message: 'A record with the same staff number already exists.' });
    expect(answer(prismaError('P2003'))).toMatchObject({
      status: 409,
      code: 'REFERENCE_CONFLICT',
    });
    expect(answer(prismaError('P2025'))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('maps tenant errors: mismatch is 403, missing context is a 500', () => {
    expect(answer(new TenantMismatchError('Branch', 'update'))).toMatchObject({
      status: 403,
      code: 'TENANT_MISMATCH',
    });
    expect(run(new TenantContextError('Branch', 'findMany')).statusCode).toBe(500);
  });

  it('hides internals of unknown errors', () => {
    const res = run(new Error('connection string postgres://secret'));
    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'INTERNAL_ERROR' },
      requestId: 'req-1',
    });
  });

  it('passes extra headers such as Retry-After', () => {
    const res = run(
      new AppException(429, 'Slow down', 'RATE_LIMITED', undefined, { 'Retry-After': '30' }),
    );
    expect(res.headers['Retry-After']).toBe('30');
  });
});

class Guardian {
  @IsString()
  name: string;

  @IsEmail({}, { message: 'Enter a valid email.' })
  email: string;
}

class Payload {
  @IsString({ message: 'Enter a name.' })
  name: string;

  @ValidateNested({ each: true })
  @Type(() => Guardian)
  guardians: Guardian[];
}

describe('validation pipe', () => {
  it('answers 422 with fields keyed by property path', async () => {
    const pipe = createValidationPipe();
    const error = await pipe
      .transform(
        { name: 1, guardians: [{ name: 'Ok', email: 'nope' }], extra: true },
        { type: 'body', metatype: Payload },
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    const { fields, code } = error as AppException;
    expect(code).toBe('VALIDATION');
    expect(fields).toEqual({
      name: 'Enter a name.',
      'guardians.0.email': 'Enter a valid email.',
      extra: 'property extra should not exist',
    });
  });
});

describe('pagination', () => {
  it('converts page/pageSize and builds the portals’ envelope', async () => {
    const pipe = createValidationPipe();
    const query = (await pipe.transform(
      { page: '3', pageSize: '20' },
      { type: 'query', metatype: PaginationQueryDto },
    )) as PaginationQueryDto;
    expect(toSkipTake(query)).toEqual({ skip: 40, take: 20 });
    expect(paginated(['a'], 41, query)).toEqual({
      data: ['a'],
      meta: { page: 3, pageSize: 20, total: 41, totalPages: 3 },
    });
    await expect(
      pipe.transform({ pageSize: '25' }, { type: 'query', metatype: PaginationQueryDto }),
    ).rejects.toMatchObject({ fields: { pageSize: 'Page size must be 10, 20 or 50.' } });
  });
});

describe('request logging', () => {
  it('drops query strings and masks invitation tokens', () => {
    expect(redactPath('/api/v1/auth/invitations/abc123/accept?x=1')).toBe(
      '/api/v1/auth/invitations/:token/accept',
    );
  });
});

describe('RequestContext', () => {
  it('starts lazy thenables (Prisma queries) inside the context', async () => {
    let seen: string | undefined = 'unset';
    // Stands in for a PrismaPromise, which only runs its query when `then` is called.
    // oxlint-disable-next-line unicorn/no-thenable
    const lazy: PromiseLike<string | undefined> = Object.defineProperty({}, 'then', {
      value: (resolve: (v: string | undefined) => void) => {
        seen = RequestContext.schoolId();
        resolve(seen);
      },
    }) as PromiseLike<string | undefined>;
    const result = await RequestContext.forSchool('school-a', () => lazy);
    expect(seen).toBe('school-a');
    expect(result).toBe('school-a');
    expect(RequestContext.schoolId()).toBeUndefined();
  });

  it('nests forSchool inside a request and keeps the request id', () => {
    RequestContext.run({ requestId: 'req-9', schoolId: 'a' }, () => {
      RequestContext.forSchool('b', () => {
        expect(RequestContext.get()).toMatchObject({ requestId: 'req-9', schoolId: 'b' });
      });
      expect(RequestContext.schoolId()).toBe('a');
    });
  });
});

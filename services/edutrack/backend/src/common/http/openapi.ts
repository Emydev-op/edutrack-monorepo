import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { TENANT_HEADER } from '@edutrack/shared';
import { refreshCookieName } from '../../auth/refresh-cookie.service.js';

type Schema = Record<string, unknown>;
type Operation = {
  summary?: string;
  security?: unknown[];
  responses: Record<
    string,
    { description?: string; content?: Record<string, { schema?: Schema }> }
  >;
  'x-message'?: string;
};

const DESCRIPTION = `
Every EduTrack portal talks to this API. All JSON answers use one envelope.

**Success** (the HTTP status is 200 or 201):

\`\`\`json
{ "success": true, "message": "Branch saved.", "data": { … } }
{ "success": true, "message": "Staff loaded.", "data": [ … ], "meta": { "page": 1, "pageSize": 20, "total": 47, "totalPages": 3 } }
\`\`\`

\`message\` is written for the person using the portal; the portals show it in their toasts. \`meta\`
is only on paged lists. Actions with nothing to return answer \`"data": null\`.

**Failure** (4xx/5xx):

\`\`\`json
{ "success": false, "message": "Enter your password.",
  "error": { "code": "VALIDATION", "fields": { "password": "Enter your password." } },
  "requestId": "4c1f…" }
\`\`\`

Branch on \`error.code\` (stable), show \`message\` (human). \`fields\` only appears on 422s.

### Signing in

1. \`POST /api/v1/auth/login\` with \`{ "portal": "school_admin" | "teacher" | "platform", "email", "password" }\`.
2. Copy \`data.accessToken\` and use **Authorize** (bearer). It lasts 15 minutes.
3. \`POST /api/v1/auth/refresh\` uses the HttpOnly refresh cookie set at sign-in to get a new one.

### Which school a request is for

| Portal | Address | How the school is chosen |
|---|---|---|
| Back office | \`console.edutrack.ng\` | No school (platform-wide) |
| School Admin | \`admin.edutrack.ng\` | The school picked at sign-in (it's in the access token) |
| Teacher, Parent, Student | \`greenfield.edutrack.ng/teacher\` … | The school in the address (\`Host\` header) |

Locally the base domain is \`localhost\`, so \`greenfield.localhost\` is Greenfield. From curl or
Postman, set the \`Host\` header (\`curl -H "Host: greenfield.localhost" http://localhost:8000/api/v1/public/school\`).
Outside production you can instead send \`${TENANT_HEADER}: greenfield\` (a school slug or id).

### Postman

Import → Link → \`/docs/openapi.json\` on this server. Re-import after pulling to pick up new routes.
`.trim();

/** The error envelope every 4xx/5xx answers with. */
const FAILURE: Schema = {
  type: 'object',
  required: ['success', 'message', 'error'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    message: { type: 'string', example: 'Something went wrong. Try again.' },
    error: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', example: 'VALIDATION' },
        fields: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Per-field messages on 422s, keyed by property path.',
        },
      },
    },
    requestId: { type: 'string', description: 'Matches the X-Request-Id response header.' },
  },
};

const PAGE_META: Schema = {
  type: 'object',
  properties: {
    page: { type: 'integer', example: 1 },
    pageSize: { type: 'integer', example: 20 },
    total: { type: 'integer', example: 47 },
    totalPages: { type: 'integer', example: 3 },
  },
};

/** Responses every route can give, with the error codes they carry. */
const COMMON_ERRORS: Record<string, string> = {
  '400': 'Malformed request (`BAD_REQUEST`).',
  '422': 'Validation failed (`VALIDATION`); see `error.fields`.',
  '429': 'Too many requests (`RATE_LIMITED`).',
  '500': 'Unexpected server error (`INTERNAL`). Quote `requestId` to support.',
};
const SIGNED_IN_ERRORS: Record<string, string> = {
  '401': 'Not signed in, or the session ended (`UNAUTHORIZED`, `SESSION_ENDED`).',
  '403': 'Signed in, but not allowed (`FORBIDDEN`, `WRONG_PORTAL`, `TENANT_MISMATCH`, …).',
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const isPaged = (schema: Schema | undefined) =>
  Boolean(
    schema &&
    (schema.properties as Schema | undefined)?.meta &&
    (schema.properties as Schema | undefined)?.data,
  );

/** Wraps a route's documented result (or any value) in the success envelope. */
function successSchema(data: Schema | undefined, message: string): Schema {
  if (isPaged(data)) {
    const props = data!.properties as Schema;
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [true] },
        message: { type: 'string', example: message },
        data: props.data,
        meta: ref('PageMeta'),
      },
    };
  }
  return {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true] },
      message: { type: 'string', example: message },
      data: data ?? { description: 'The result (`null` for actions with nothing to return).' },
    },
  };
}

/**
 * Rewrites the generated document so it matches what the API actually sends: every 2xx is wrapped
 * in the success envelope (with the route's own message as the example), and every route lists
 * the error envelope for its possible failures. Routes marked `@RawResponse()` (health) are left
 * as they are.
 */
export function applyEnvelope(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ApiFailure = FAILURE;
  document.components.schemas.PageMeta = PAGE_META;

  for (const [path, item] of Object.entries(document.paths)) {
    if (path.includes('/health')) continue;
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const op = (item as Record<string, Operation | undefined>)[method];
      if (!op) continue;
      const message = op['x-message'] ?? 'Done.';
      for (const [status, response] of Object.entries(op.responses)) {
        if (!status.startsWith('2') || status === '204') continue;
        response.description ||= 'Success.';
        const current = response.content?.['application/json']?.schema;
        response.content = {
          'application/json': { schema: successSchema(current, message) },
        };
      }
      const errors = { ...COMMON_ERRORS, ...(op.security?.length ? SIGNED_IN_ERRORS : {}) };
      for (const [status, description] of Object.entries(op.responses)) {
        if (/^[45]/.test(status))
          op.responses[status] = {
            description: description.description,
            content: { 'application/json': { schema: ref('ApiFailure') } },
          };
      }
      for (const [status, description] of Object.entries(errors)) {
        op.responses[status] ??= {
          description,
          content: { 'application/json': { schema: ref('ApiFailure') } },
        };
      }
    }
  }
  return document;
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('EduTrack API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth(
      refreshCookieName('SCHOOL_ADMIN'),
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'Refresh token cookie, one per portal: et_rt_school_admin, et_rt_teacher, et_rt_platform. ' +
          'HttpOnly, SameSite=Lax, Path=/api/v1/auth.',
      },
      'refresh-cookie',
    )
    .addGlobalParameters({
      in: 'header',
      name: TENANT_HEADER,
      required: false,
      description:
        'Outside production only: the school (slug such as `greenfield`, or id) when the Host ' +
        'has no school subdomain. In production the school comes from the address.',
    })
    .build();
  return applyEnvelope(SwaggerModule.createDocument(app, config));
}

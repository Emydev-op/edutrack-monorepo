import { validateEnv } from './env.validation.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'edutrack',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
};

describe('portal link templates', () => {
  it('accepts the school’s address with the portal’s path', () => {
    expect(() =>
      validateEnv({
        ...base,
        TEACHER_PORTAL_URL_TEMPLATE: 'http://{slug}.localhost:5172/teacher',
        PARENT_PORTAL_URL_TEMPLATE: 'https://{slug}.edutrack.ng/parent/',
      }),
    ).not.toThrow();
  });

  it.each([
    ['TEACHER_PORTAL_URL_TEMPLATE', 'http://localhost:5172'],
    ['TEACHER_PORTAL_URL_TEMPLATE', 'http://{slug}.localhost:5172'],
    ['TEACHER_PORTAL_URL_TEMPLATE', 'http://localhost:5172/teacher?school={slug}'],
    ['PARENT_PORTAL_URL_TEMPLATE', 'http://{slug}.localhost/teacher'],
    ['STUDENT_PORTAL_URL_TEMPLATE', 'http://localhost/{slug}/student'],
  ])('refuses %s=%s, which would send links without the school or portal', (key, value) => {
    expect(() => validateEnv({ ...base, [key]: value })).toThrow(key);
  });
});

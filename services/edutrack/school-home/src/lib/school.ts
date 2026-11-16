import type { ApiFailure, ApiSuccess, PublicSchool } from '@edutrack/shared';

/** What the API says about the school at this address. */
export type SchoolLookup =
  { kind: 'found'; school: PublicSchool } | { kind: 'not-found'; message: string };

/** The API could not be reached or answered with something unexpected; worth retrying. */
export class SchoolLookupError extends Error {
  override name = 'SchoolLookupError';
}

const NOT_FOUND_MESSAGE =
  'We couldn’t find a school at this address. Check the link your school sent you.';

/**
 * Reads `GET /v1/public/school`. The API works out the school from the page's address (the Host),
 * so nothing is sent. An unknown address is an answer (`not-found`), not an error; network
 * failures and server errors throw `SchoolLookupError` so the page can offer a retry.
 */
export async function lookUpSchool(
  apiUrl: string = import.meta.env.VITE_API_URL || '/api',
): Promise<SchoolLookup> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/public/school`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
  } catch {
    throw new SchoolLookupError('We couldn’t reach Edutrack. Check your connection and try again.');
  }

  const body = (await response.json().catch(() => null)) as
    ApiSuccess<PublicSchool> | ApiFailure | null;

  if (response.ok && body?.success) return { kind: 'found', school: body.data };
  if (response.status === 404 && body && !body.success && body.error?.code === 'SCHOOL_NOT_FOUND')
    return { kind: 'not-found', message: body.message || NOT_FOUND_MESSAGE };

  throw new SchoolLookupError('Something went wrong on our side. Please try again in a moment.');
}

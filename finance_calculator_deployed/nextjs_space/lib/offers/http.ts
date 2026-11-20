// ServiceResult -> HTTP response, for the /api/offers routes. Keeps the exact bodies and
// status codes the routes returned before the service was extracted.

import { NextResponse } from 'next/server';
import { accessError } from '../access/errors';
import type { ServiceError, ServiceResult } from './result';

export function errorResponse(error: ServiceError): NextResponse {
  if (error.kind === 'access') return accessError(error.code, error.extra);
  return NextResponse.json({ error: error.error, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
}

export function toResponse<T>(result: ServiceResult<T>, status = 200): NextResponse {
  return result.ok ? NextResponse.json(result.value, { status }) : errorResponse(result.error);
}

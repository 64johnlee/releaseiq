import { NextResponse } from "next/server";

/** Uniform 500 response for an unexpected error in a route handler. */
export function serverError(err: unknown): NextResponse {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status: 500 },
  );
}

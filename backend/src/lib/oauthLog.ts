// SEC-005 — Google's OAuth token-exchange response body can carry
// access_token / refresh_token / id_token even on some failure paths.
// Logging it raw at warn level (which we used to do in oauth-google.ts
// + calendar.ts) puts those tokens on disk for anyone with read access
// to the log pipeline.
//
// This helper returns the only fields we actually need to debug a
// failed exchange: the HTTP status, plus Google's `error` /
// `error_description` strings. Everything else is dropped.

export function redactTokenExchangeError(tokens: any, status: number) {
  return {
    status,
    error: tokens?.error ?? null,
    error_description: tokens?.error_description ?? null,
  };
}

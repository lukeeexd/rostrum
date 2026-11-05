import { ApiError } from "@/api/client";

/**
 * What to show for a failed call. When Podium refused the request itself (a
 * 4xx with a reason, such as "every stream on channel 462 was dead"), its own
 * words; otherwise Rostrum's message, which already explains an unreachable
 * Podium, a timeout or a refused token.
 */
export function errorText(err: Error): string {
  const podiumRefused = err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.detail;
  return podiumRefused ? err.detail : err.message;
}

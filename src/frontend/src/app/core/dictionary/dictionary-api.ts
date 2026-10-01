import type { HttpResourceRequest } from '@angular/common/http';

/**
 * Request for this app's own backend (Dictionary.Api), which looks a word up across several
 * dictionary sources in parallel. The URL is relative: `ng serve` proxies `/api` to the backend
 * (proxy.conf.json), so the browser never makes a cross-origin call.
 */
export function dictionaryLookupRequest(
  word: string,
  sources: readonly string[],
): HttpResourceRequest {
  return {
    url: `/api/dictionaries/lookup/${encodeURIComponent(word)}`,
    params: { sources: [...sources] },
  };
}

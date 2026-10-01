import type { Resource } from '@angular/core';

/**
 * A resource's value, or `undefined` while it has none. Reading `value()` directly throws once a
 * resource is in an error state - e.g. Anki isn't running, or the backend is down - which would
 * break every computed built on top of it rather than just showing the error.
 */
export function valueOf<T>(resource: Resource<T>): T | undefined {
  return resource.hasValue() ? resource.value() : undefined;
}

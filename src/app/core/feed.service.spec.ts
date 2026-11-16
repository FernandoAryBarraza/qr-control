import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, ErrorHandler, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FeedService } from './feed.service';
import { PaseStore } from './pase-store';

/** Captures what Angular routes to the `ErrorHandler` (after-render hooks). */
class CapturingErrorHandler extends ErrorHandler {
  readonly errors: unknown[] = [];

  override handleError(error: unknown): void {
    this.errors.push(error);
  }
}

/** Runs the `afterNextRender` callbacks the service registered. */
function flushRenderEffects(): void {
  TestBed.inject(ApplicationRef).tick();
}

/**
 * `afterNextRender` callbacks run OUTSIDE any injection context, so the
 * service has to resolve its `DestroyRef` while the constructor still has
 * one. Injecting it inside the callback raises NG0203 (`-203`), which
 * Angular only reports through the `ErrorHandler` — hence the capture.
 */
describe('FeedService', () => {
  let handler: CapturingErrorHandler;

  beforeEach(() => {
    handler = new CapturingErrorHandler();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ErrorHandler, useValue: handler },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('takes the browser branch, so the render callback is not a no-op', () => {
    // On the server the `isBrowser` guard returns before the injection, which
    // would make the spec below pass for the wrong reason.
    expect(TestBed.inject(PLATFORM_ID)).toBe('browser');
  });

  it('resolves the DestroyRef in an injection context, not inside the callback', () => {
    TestBed.inject(FeedService);
    flushRenderEffects();

    // An empty list means no injection error was raised; NG0203 is `-203`.
    expect(handler.errors.map((error) => (error as { code?: number }).code)).toEqual([]);
  });

  it('stops the scan interval when the service is destroyed', () => {
    vi.useFakeTimers();
    TestBed.inject(PaseStore).setRole('provider');
    const feed = TestBed.inject(FeedService);
    flushRenderEffects();

    vi.advanceTimersByTime(3600);
    expect(feed.items()).toHaveLength(1);

    TestBed.resetTestingModule();
    vi.advanceTimersByTime(3600);
    expect(feed.items()).toHaveLength(1);
  });
});

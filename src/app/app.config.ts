import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideClientHydration } from '@angular/platform-browser';

/**
 * No router yet: the shell renders one view at a time and the feature
 * slices arrive as routes later, at which point `provideRouter` comes
 * back with them rather than shipping an empty route table now.
 *
 * `provideHttpClient` backs the `DataApiService` read path (design §4) —
 * the browser's only channel to the standalone REST API.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideClientHydration(), provideHttpClient()],
};

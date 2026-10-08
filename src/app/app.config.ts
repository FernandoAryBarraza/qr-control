import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';

/**
 * No router yet: the shell renders one view at a time and the feature
 * slices arrive as routes later, at which point `provideRouter` comes
 * back with them rather than shipping an empty route table now.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideClientHydration()],
};
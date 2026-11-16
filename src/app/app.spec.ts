import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // PaseStore depends on DataApiService → HttpClient; the root component
      // test never talks to a real backend (PR-1d).
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the topbar and the admin view by default', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.brand-name')?.textContent).toContain('PASE');
    expect(el.querySelector('#view-admin')).toBeTruthy();
    expect(el.querySelector('#view-provider')).toBeNull();
  });

  it('should keep the page reachable while no modal is open', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const content = (fixture.nativeElement as HTMLElement).querySelector('.app-content');

    expect(content?.hasAttribute('inert')).toBe(false);
    expect(content?.hasAttribute('aria-hidden')).toBe(false);
  });
});

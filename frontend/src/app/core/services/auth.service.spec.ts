import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }])],
    });
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start as not authenticated', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.userEmail()).toBeNull();
  });

  it('should restore session from sessionStorage', () => {
    // Manually create a fake JWT with theodo.com email
    const payload = { email: 'test@theodo.com', name: 'Test User', picture: 'http://pic.jpg', sub: '123' };
    const fakeJwt = `header.${btoa(JSON.stringify(payload))}.signature`;
    sessionStorage.setItem('google_token', fakeJwt);

    // Reset TestBed to create a fresh service that reads from sessionStorage
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }])],
    });
    const newService = TestBed.inject(AuthService);
    expect(newService.isAuthenticated()).toBe(true);
    expect(newService.userEmail()).toBe('test@theodo.com');
    expect(newService.userName()).toBe('Test User');
  });

  it('should clear session on logout', () => {
    const payload = { email: 'test@theodo.com', name: 'Test User', picture: 'http://pic.jpg', sub: '123' };
    const fakeJwt = `header.${btoa(JSON.stringify(payload))}.signature`;
    sessionStorage.setItem('google_token', fakeJwt);
    sessionStorage.setItem('user_email', 'test@theodo.com');

    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('google_token')).toBeNull();
  });
});

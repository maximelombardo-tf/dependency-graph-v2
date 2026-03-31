import { Injectable, signal, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

declare const google: any;

interface GoogleCredentialResponse {
  credential: string;
}

interface JwtPayload {
  email: string;
  name: string;
  picture: string;
  sub: string;
}

const ALLOWED_DOMAINS = ['theodo.com', 'ext.theodo.com'];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly ngZone = inject(NgZone);
  private readonly router = inject(Router);

  readonly isAuthenticated = signal(false);
  readonly userEmail = signal<string | null>(null);
  readonly userName = signal<string | null>(null);
  readonly userPicture = signal<string | null>(null);
  readonly authError = signal<string | null>(null);

  readonly isBypassed = environment.bypassAuth;

  constructor() {
    if (this.isBypassed) {
      this.isAuthenticated.set(true);
      this.userEmail.set('dev@theodo.com');
      this.userName.set('Dev Local');
    } else {
      this.restoreSession();
    }
  }

  initGoogleAuth(buttonElement: HTMLElement): void {
    this.waitForGoogleScript().then(() => {
      google.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: (response: GoogleCredentialResponse) => {
          this.ngZone.run(() => this.handleCredentialResponse(response));
        },
      });

      google.accounts.id.renderButton(buttonElement, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 300,
      });
    }).catch(() => {
      this.authError.set('Impossible de charger Google Sign-In. Rechargez la page.');
    });
  }

  private waitForGoogleScript(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined' && google.accounts) {
        resolve();
        return;
      }
      const interval = 100;
      let elapsed = 0;
      const check = setInterval(() => {
        if (typeof google !== 'undefined' && google.accounts) {
          clearInterval(check);
          resolve();
        } else if ((elapsed += interval) >= timeoutMs) {
          clearInterval(check);
          reject(new Error('Google Identity Services script failed to load'));
        }
      }, interval);
    });
  }

  handleCredentialResponse(response: GoogleCredentialResponse): void {
    const payload = this.decodeJwt(response.credential);
    if (!payload) {
      this.authError.set('Erreur de décodage du token');
      return;
    }

    const domain = payload.email.split('@')[1];
    if (!ALLOWED_DOMAINS.includes(domain)) {
      this.authError.set(`Accès restreint aux employés Theodo (domaine ${domain} non autorisé)`);
      return;
    }

    localStorage.setItem('google_token', response.credential);
    localStorage.setItem('user_email', payload.email);
    localStorage.setItem('user_name', payload.name);
    localStorage.setItem('user_picture', payload.picture);

    this.isAuthenticated.set(true);
    this.userEmail.set(payload.email);
    this.userName.set(payload.name);
    this.userPicture.set(payload.picture);
    this.authError.set(null);

    this.router.navigate(['/graph']);
  }

  logout(): void {
    localStorage.removeItem('google_token');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_picture');

    this.isAuthenticated.set(false);
    this.userEmail.set(null);
    this.userName.set(null);
    this.userPicture.set(null);

    this.router.navigate(['/login']);
  }

  getIdToken(): string | null {
    return localStorage.getItem('google_token');
  }

  private restoreSession(): void {
    const token = localStorage.getItem('google_token');
    if (token) {
      const payload = this.decodeJwt(token);
      if (payload) {
        this.isAuthenticated.set(true);
        this.userEmail.set(payload.email);
        this.userName.set(payload.name);
        this.userPicture.set(payload.picture);
      }
    }
  }

  private decodeJwt(token: string): JwtPayload | null {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }
}

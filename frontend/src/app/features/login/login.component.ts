import { Component, ElementRef, ViewChild, AfterViewInit, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div class="text-center">
          <h1 class="text-3xl font-bold text-gray-900">Dependency Graph</h1>
          <p class="mt-2 text-sm text-gray-600">Visualisez les dépendances entre vos tickets Notion</p>
        </div>

        <div class="flex justify-center">
          <div #googleBtn></div>
        </div>

        @if (authService.authError()) {
          <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p class="text-sm text-red-700">{{ authService.authError() }}</p>
          </div>
        }

        <p class="text-xs text-center text-gray-400">
          Accès réservé au domaine &#64;theodo.com
        </p>
      </div>
    </div>
  `,
})
export class LoginComponent implements AfterViewInit {
  readonly authService = inject(AuthService);

  @ViewChild('googleBtn') googleBtn!: ElementRef;

  ngAfterViewInit(): void {
    this.authService.initGoogleAuth(this.googleBtn.nativeElement);
  }
}

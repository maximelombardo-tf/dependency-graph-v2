import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="max-w-sm mx-auto mt-16">
      <h1 class="text-2xl font-semibold text-gray-900 mb-6">Connexion admin</h1>
      <form (ngSubmit)="login()" class="space-y-4">
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            [(ngModel)]="password"
            name="password"
            required
            class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>

        @if (error()) {
          <p class="text-sm text-red-600">{{ error() }}</p>
        }

        <button
          type="submit"
          [disabled]="loading()"
          class="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {{ loading() ? 'Connexion...' : 'Se connecter' }}
        </button>
      </form>
    </div>
  `,
})
export class AdminLoginComponent {
  private readonly adminService = inject(AdminService);
  private readonly router = inject(Router);

  password = '';
  readonly loading = signal(false);
  readonly error = signal('');

  login(): void {
    if (!this.password) return;
    this.loading.set(true);
    this.error.set('');

    this.adminService.login(this.password).subscribe({
      next: () => this.router.navigate(['/admin/teams']),
      error: () => {
        this.error.set('Mot de passe incorrect.');
        this.loading.set(false);
      },
    });
  }
}

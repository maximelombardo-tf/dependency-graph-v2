import { Component, inject } from '@angular/core';
import { RouterOutlet, Router, RouterLink } from '@angular/router';
import { AdminService } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <a routerLink="/graph" class="text-gray-400 hover:text-gray-600 transition-colors" title="Retour au graph">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </a>
          <span class="text-lg font-semibold text-gray-900">Administration</span>
          @if (adminService.isAuthenticated()) {
            <nav class="flex gap-4 ml-6">
              <a routerLink="/admin/teams" class="text-sm text-gray-600 hover:text-gray-900">Équipes</a>
            </nav>
          }
        </div>
        @if (adminService.isAuthenticated()) {
          <button
            (click)="logout()"
            class="text-sm text-gray-500 hover:text-gray-900"
          >
            Déconnexion
          </button>
        }
      </header>
      <main class="p-6">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AdminComponent {
  readonly adminService = inject(AdminService);
  private readonly router = inject(Router);

  logout(): void {
    this.adminService.logout();
    this.router.navigate(['/admin/login']);
  }
}

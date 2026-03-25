import { Component, inject } from '@angular/core';
import { SelectorComponent } from '../selector/selector.component';
import { AuthService } from '../../core/services/auth.service';
import { TeamConfigService } from '../../core/services/team-config.service';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [SelectorComponent],
  template: `
    <div class="min-h-screen flex flex-col">
      <header class="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <h1 class="text-lg font-semibold text-gray-800">Dependency Graph</h1>
        <div class="flex items-center gap-3">
          @if (authService.userName()) {
            <span class="text-sm text-gray-600">{{ authService.userName() }}</span>
          }
          <button
            class="text-sm text-gray-500 hover:text-gray-700 underline"
            (click)="authService.logout()"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <app-selector />

      @if (teamConfigService.hasSelection()) {
        <div class="flex-1 p-4">
          <p class="text-gray-500">Kanban board - à implémenter (Phase 6)</p>
        </div>
      } @else {
        <div class="flex-1 flex items-center justify-center">
          <p class="text-gray-400">Sélectionnez une équipe et une epic pour commencer</p>
        </div>
      }
    </div>
  `,
})
export class BoardComponent {
  readonly authService = inject(AuthService);
  readonly teamConfigService = inject(TeamConfigService);
}

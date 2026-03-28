import { Component, inject, signal, OnInit } from '@angular/core';
import { AdminService, TeamWithToken } from '../../../core/services/admin.service';
import { TeamConfig } from '../../../core/models/team-config.model';
import { AdminTeamFormComponent } from '../admin-team-form/admin-team-form.component';

@Component({
  selector: 'app-admin-teams',
  standalone: true,
  imports: [AdminTeamFormComponent],
  template: `
    <div class="max-w-4xl">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-semibold text-gray-900">Équipes</h1>
        <button
          (click)="openForm(null)"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          + Nouvelle équipe
        </button>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-12">
          <div class="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else if (teams().length === 0) {
        <div class="text-center py-12 text-gray-500">
          <p class="text-sm">Aucune équipe configurée.</p>
          <p class="text-xs mt-1">Créez votre première équipe pour commencer.</p>
        </div>
      } @else {
        <div class="space-y-3">
          @for (team of teams(); track team.id) {
            <div class="bg-white rounded-lg border border-gray-200 p-4 flex items-start justify-between">
              <div>
                <h3 class="font-medium text-gray-900">{{ team.name }}</h3>
                <p class="text-xs text-gray-500 mt-1">ID: {{ team.id }}</p>
                <div class="mt-2 flex gap-4 text-xs text-gray-500">
                  <span>Epic DB: <code class="font-mono">{{ team.epicDatabaseId }}</code></span>
                  <span>US DB: <code class="font-mono">{{ team.usDatabaseId }}</code></span>
                </div>
              </div>
              <div class="flex gap-2 ml-4 shrink-0">
                <button
                  (click)="openForm(team)"
                  class="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Modifier
                </button>
                <button
                  (click)="deleteTeam(team)"
                  class="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded-md hover:bg-red-50"
                >
                  Supprimer
                </button>
              </div>
            </div>
          }
        </div>
      }

      @if (error()) {
        <p class="mt-4 text-sm text-red-600">{{ error() }}</p>
      }
    </div>

    @if (showForm()) {
      <app-admin-team-form
        [team]="editingTeam()"
        (saved)="onSaved($event)"
        (cancelled)="showForm.set(false)"
      />
    }
  `,
})
export class AdminTeamsComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly teams = signal<TeamWithToken[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly showForm = signal(false);
  readonly editingTeam = signal<TeamWithToken | null>(null);

  ngOnInit(): void {
    this.loadTeams();
  }

  private loadTeams(): void {
    this.loading.set(true);
    this.error.set('');
    this.adminService.getTeams().subscribe({
      next: teams => {
        this.teams.set(teams);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les équipes.');
        this.loading.set(false);
      },
    });
  }

  openForm(team: TeamWithToken | null): void {
    this.editingTeam.set(team);
    this.showForm.set(true);
  }

  onSaved(team: TeamConfig): void {
    this.showForm.set(false);
    const existing = this.editingTeam();
    if (existing) {
      this.teams.update(teams => teams.map(t => t.id === team.id ? { ...team } : t));
    } else {
      this.teams.update(teams => [...teams, { ...team }]);
    }
  }

  deleteTeam(team: TeamWithToken): void {
    if (!confirm(`Supprimer l'équipe "${team.name}" ?`)) return;
    this.adminService.deleteTeam(team.id).subscribe({
      next: () => this.teams.update(teams => teams.filter(t => t.id !== team.id)),
      error: () => this.error.set('Impossible de supprimer l\'équipe.'),
    });
  }
}

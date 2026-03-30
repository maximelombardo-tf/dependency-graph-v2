import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { TeamConfig, ColumnKey } from '../models/team-config.model';
import { Epic } from '../models/ticket.model';

@Injectable({ providedIn: 'root' })
export class TeamConfigService {
  // Use HttpBackend directly to bypass interceptors and avoid circular dependency
  // (TeamInterceptor → TeamConfigService → HttpClient → TeamInterceptor)
  private readonly http = new HttpClient(inject(HttpBackend));

  readonly teams = signal<TeamConfig[]>([]);
  readonly loadingTeams = signal(true);
  readonly selectedTeam = signal<TeamConfig | null>(null);
  readonly selectedEpic = signal<Epic | null>(null);

  readonly hasSelection = computed(() => !!this.selectedTeam() && !!this.selectedEpic());

  constructor() {
    this.loadTeamsFromApi();
  }

  private loadTeamsFromApi(): void {
    this.loadingTeams.set(true);
    this.http.get<TeamConfig[]>('/api/admin/teams').subscribe({
      next: teams => {
        this.teams.set(teams);
        this.restoreSelection();
        this.loadingTeams.set(false);
      },
      error: () => {
        this.loadingTeams.set(false);
      },
    });
  }

  selectTeam(team: TeamConfig): void {
    this.selectedTeam.set(team);
    this.selectedEpic.set(null);
    localStorage.setItem('selectedTeamName', team.name);
  }

  selectEpic(epic: Epic): void {
    this.selectedEpic.set(epic);
    localStorage.setItem('selectedEpicId', epic.id);
    localStorage.setItem('selectedEpicTitle', epic.title);
  }

  restoreSelection(): void {
    const teamName = localStorage.getItem('selectedTeamName');
    if (teamName) {
      const team = this.teams().find(t => t.name === teamName);
      if (team) {
        this.selectedTeam.set(team);
      }
    }

    const epicId = localStorage.getItem('selectedEpicId');
    const epicTitle = localStorage.getItem('selectedEpicTitle');
    if (epicId && epicTitle) {
      this.selectedEpic.set({ id: epicId, title: epicTitle });
    }
  }

  getColumnKeyForStatus(status: string): ColumnKey | null {
    const team = this.selectedTeam();
    if (!team) return null;

    const statuses = team.propertiesName.statuses;
    for (const [key, values] of Object.entries(statuses)) {
      if (values.includes(status)) {
        return key as ColumnKey;
      }
    }
    return null;
  }

  getFirstStatusForColumn(columnKey: ColumnKey): string | null {
    const team = this.selectedTeam();
    if (!team) return null;
    const statuses = team.propertiesName.statuses[columnKey];
    return statuses.length > 0 ? statuses[0] : null;
  }
}

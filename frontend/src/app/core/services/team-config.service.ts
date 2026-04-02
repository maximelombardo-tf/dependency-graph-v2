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
  readonly selectedEpics = signal<Epic[]>([]);

  readonly hasSelection = computed(() => !!this.selectedTeam() && this.selectedEpics().length > 0);

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
    this.selectedEpics.set([]);
    localStorage.setItem('selectedTeamName', team.name);
    localStorage.removeItem('selectedEpics');
  }

  toggleEpic(epic: Epic): void {
    const current = this.selectedEpics();
    const exists = current.some(e => e.id === epic.id);
    const updated = exists
      ? current.filter(e => e.id !== epic.id)
      : [...current, epic];
    this.selectedEpics.set(updated);
    localStorage.setItem('selectedEpics', JSON.stringify(updated));
  }

  setEpics(epics: Epic[]): void {
    this.selectedEpics.set(epics);
    localStorage.setItem('selectedEpics', JSON.stringify(epics));
  }

  restoreSelection(): void {
    const teamName = localStorage.getItem('selectedTeamName');
    if (teamName) {
      const team = this.teams().find(t => t.name === teamName);
      if (team) {
        this.selectedTeam.set(team);
      }
    }

    const epicsRaw = localStorage.getItem('selectedEpics');
    if (epicsRaw) {
      try {
        const epics: Epic[] = JSON.parse(epicsRaw);
        if (Array.isArray(epics) && epics.length > 0) {
          this.selectedEpics.set(epics);
        }
      } catch {}
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

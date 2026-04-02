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
  readonly extraDisplayFields = signal<string[]>([]);
  readonly availableExtraFields = signal<string[]>([]);

  readonly hasSelection = computed(() => !!this.selectedTeam() && this.selectedEpics().length > 0);

  private static readonly EPIC_COLORS = [
    '#3B82F6', '#22C55E', '#F97316', '#8B5CF6', '#EC4899',
    '#EAB308', '#06B6D4', '#EF4444', '#14B8A6', '#6366F1',
  ];

  readonly epicColorMap = computed(() => {
    const map = new Map<string, string>();
    const epics = this.selectedEpics();
    epics.forEach((epic, i) => {
      map.set(epic.id, TeamConfigService.EPIC_COLORS[i % TeamConfigService.EPIC_COLORS.length]);
    });
    return map;
  });

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

  private get displayFieldsKey(): string {
    return `displayFields_${this.selectedTeam()?.id}`;
  }

  selectTeam(team: TeamConfig): void {
    this.selectedTeam.set(team);
    this.selectedEpics.set([]);
    localStorage.setItem('selectedTeamName', team.name);
    localStorage.removeItem('selectedEpics');
    this.restoreDisplayFields();
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

  setAvailableExtraFields(fields: string[]): void {
    this.availableExtraFields.set(fields.sort());
  }

  toggleDisplayField(field: string): void {
    const current = this.extraDisplayFields();
    if (current.includes(field)) {
      const updated = current.filter(f => f !== field);
      this.extraDisplayFields.set(updated);
      localStorage.setItem(this.displayFieldsKey, JSON.stringify(updated));
    } else if (current.length < 2) {
      const updated = [...current, field];
      this.extraDisplayFields.set(updated);
      localStorage.setItem(this.displayFieldsKey, JSON.stringify(updated));
    }
  }

  private restoreDisplayFields(): void {
    try {
      const raw = localStorage.getItem(this.displayFieldsKey);
      if (raw) {
        const fields: string[] = JSON.parse(raw);
        if (Array.isArray(fields)) {
          this.extraDisplayFields.set(fields.slice(0, 2));
          return;
        }
      }
    } catch {}
    this.extraDisplayFields.set([]);
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

import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { TeamConfig, ColumnKey } from '../models/team-config.model';
import { Epic } from '../models/ticket.model';

const FALLBACK_TEAMS: TeamConfig[] = [
  {
    id: 'flash',
    name: 'Flash',
    epicDatabaseId: 'f81ab481-d098-4b16-bad2-9e8a554b5941',
    usDatabaseId: '513b199d-91b3-450b-89ea-f18d768c3786',
    propertiesName: {
      id: 'ID',
      title: 'Name',
      status: 'Status',
      complexity: 'Size',
      bloque: 'Bloque',
      statuses: {
        backlogToPrepare: ['02 - Backlog à préparer'],
        toChallenge: ['1 🛹 Backlog'],
        toStrat: ['2 🛴 Strat tech'],
        toDev: ['21 - Backlog ready'],
        sprintBacklog: ['3 🛴 Sprint backlog'],
        isInProgress: ['4 🎯Daily Goals', '5 👨🏻‍💻 Doing', '61 👁️ Code review', '62 🚀 To Deploy Preprod'],
        done: ['9 🎯 Done Sprint actuel', 'Anciens Sprints'],
        toValidate: ['8 👀 A valider', '81 🚢 To Ship (Prod)'],
        blocked: ['7 🚨 Blocked'],
      },
      epic: 'Epic',
      epicName: 'Name',
      assignedTo: 'Assign',
    },
    epicFilter: [
      { property: 'Status', type: 'select', value: 'Delivery Team' },
      { property: 'Équipe', type: 'multi_select', value: 'Plateformes Flash' },
    ],
  },
];

@Injectable({ providedIn: 'root' })
export class TeamConfigService {
  // Use HttpBackend directly to bypass interceptors and avoid circular dependency
  // (TeamInterceptor → TeamConfigService → HttpClient → TeamInterceptor)
  private readonly http = new HttpClient(inject(HttpBackend));

  readonly teams = signal<TeamConfig[]>(FALLBACK_TEAMS);
  readonly selectedTeam = signal<TeamConfig | null>(null);
  readonly selectedEpic = signal<Epic | null>(null);

  readonly hasSelection = computed(() => !!this.selectedTeam() && !!this.selectedEpic());

  constructor() {
    this.loadTeamsFromApi();
  }

  private loadTeamsFromApi(): void {
    this.http.get<TeamConfig[]>('/api/admin/teams').subscribe({
      next: teams => {
        if (teams.length > 0) {
          this.teams.set(teams);
          this.reapplySelection();
        }
      },
      error: () => {
        // Silently fall back to hardcoded teams (local dev or API unavailable)
      },
    });
  }

  private reapplySelection(): void {
    const current = this.selectedTeam();
    if (current) {
      const refreshed = this.teams().find(t => t.name === current.name);
      if (refreshed) this.selectedTeam.set(refreshed);
    }
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

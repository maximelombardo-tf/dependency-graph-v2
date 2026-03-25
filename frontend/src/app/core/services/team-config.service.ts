import { Injectable, signal, computed } from '@angular/core';
import { TeamConfig, ColumnKey } from '../models/team-config.model';
import { Epic } from '../models/ticket.model';

const TEAMS: TeamConfig[] = [
  {
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
  readonly teams = signal<TeamConfig[]>(TEAMS);
  readonly selectedTeam = signal<TeamConfig | null>(null);
  readonly selectedEpic = signal<Epic | null>(null);

  readonly hasSelection = computed(() => !!this.selectedTeam() && !!this.selectedEpic());

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
      const team = TEAMS.find(t => t.name === teamName);
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

import { Component, inject, signal, effect, output } from '@angular/core';
import { TeamConfigService } from '../../core/services/team-config.service';
import { NotionService } from '../../core/services/notion.service';
import { TeamConfig } from '../../core/models/team-config.model';
import { Epic } from '../../core/models/ticket.model';

@Component({
  selector: 'app-selector',
  standalone: true,
  template: `
    <div class="flex items-center gap-4 p-4 bg-white border-b border-gray-200">
      <div class="flex items-center gap-2">
        <label for="team-select" class="text-sm font-medium text-gray-700">Équipe</label>
        <select
          id="team-select"
          class="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          [value]="teamConfigService.selectedTeam()?.name || ''"
          (change)="onTeamChange($event)"
        >
          <option value="" disabled>Choisir une équipe</option>
          @for (team of teamConfigService.teams(); track team.name) {
            <option [value]="team.name">{{ team.name }}</option>
          }
        </select>
      </div>

      <div class="flex items-center gap-2">
        <label for="epic-select" class="text-sm font-medium text-gray-700">Epic</label>
        <select
          id="epic-select"
          class="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          [disabled]="!teamConfigService.selectedTeam() || loadingEpics()"
          [value]="teamConfigService.selectedEpic()?.id || ''"
          (change)="onEpicChange($event)"
        >
          @if (loadingEpics()) {
            <option value="" disabled>Chargement...</option>
          } @else {
            <option value="" disabled>Choisir une epic</option>
            @for (epic of epics(); track epic.id) {
              <option [value]="epic.id">{{ epic.title }}</option>
            }
          }
        </select>
      </div>

      @if (loadingEpics()) {
        <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      }
    </div>
  `,
})
export class SelectorComponent {
  readonly teamConfigService = inject(TeamConfigService);
  private readonly notionService = inject(NotionService);

  readonly epics = signal<Epic[]>([]);
  readonly loadingEpics = signal(false);
  readonly epicSelected = output<Epic>();

  constructor() {
    this.teamConfigService.restoreSelection();

    effect(() => {
      const team = this.teamConfigService.selectedTeam();
      if (team) {
        this.fetchEpics(team);
      }
    });
  }

  onTeamChange(event: Event): void {
    const name = (event.target as HTMLSelectElement).value;
    const team = this.teamConfigService.teams().find(t => t.name === name);
    if (team) {
      this.teamConfigService.selectTeam(team);
    }
  }

  onEpicChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const epic = this.epics().find(e => e.id === id);
    if (epic) {
      this.teamConfigService.selectEpic(epic);
      this.epicSelected.emit(epic);
    }
  }

  private fetchEpics(team: TeamConfig): void {
    this.loadingEpics.set(true);
    this.notionService.getEpicsForTeam(team).subscribe({
      next: epics => {
        this.epics.set(epics);
        this.loadingEpics.set(false);
      },
      error: err => {
        console.error('Failed to fetch epics:', err);
        this.epics.set([]);
        this.loadingEpics.set(false);
      },
    });
  }
}

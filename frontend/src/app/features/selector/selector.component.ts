import { Component, inject, signal, effect, HostListener } from '@angular/core';
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
          [disabled]="teamConfigService.loadingTeams()"
          (change)="onTeamChange($event)"
        >
          @if (teamConfigService.loadingTeams()) {
            <option value="" disabled>Chargement...</option>
          } @else if (teamConfigService.teams().length === 0) {
            <option value="" disabled>Aucune équipe configurée</option>
          } @else {
            <option value="" disabled>Choisir une équipe</option>
            @for (team of teamConfigService.teams(); track team.name) {
              <option [value]="team.name">{{ team.name }}</option>
            }
          }
        </select>
      </div>

      <div class="flex items-center gap-2 relative">
        <label class="text-sm font-medium text-gray-700">Epic</label>
        <button
          class="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-left min-w-[200px] flex items-center justify-between gap-2"
          [disabled]="!teamConfigService.selectedTeam() || loadingEpics()"
          (click)="toggleDropdown($event)"
        >
          <span class="truncate">
            @if (loadingEpics()) {
              Chargement...
            } @else if (teamConfigService.selectedEpics().length === 0) {
              Choisir des epics
            } @else if (teamConfigService.selectedEpics().length === 1) {
              {{ teamConfigService.selectedEpics()[0].title }}
            } @else {
              {{ teamConfigService.selectedEpics().length }} epics
            }
          </span>
          <svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        @if (dropdownOpen()) {
          <div class="absolute top-full left-8 mt-1 z-50 bg-white rounded-md border border-gray-200 shadow-lg w-72 max-h-64 overflow-y-auto">
            @if (epics().length > 3) {
              <div class="sticky top-0 bg-white border-b border-gray-100 p-2">
                <input
                  class="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="Rechercher..."
                  [value]="searchQuery()"
                  (input)="onSearch($event)"
                  (click)="$event.stopPropagation()"
                />
              </div>
            }
            <div class="py-1">
              @for (epic of filteredEpics(); track epic.id) {
                <label
                  class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
                  (click)="$event.stopPropagation()"
                >
                  <input
                    type="checkbox"
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    [checked]="isSelected(epic)"
                    (change)="onEpicToggle(epic)"
                  />
                  <span class="truncate">{{ epic.title }}</span>
                </label>
              }
              @if (filteredEpics().length === 0) {
                <div class="px-3 py-2 text-sm text-gray-400">Aucun résultat</div>
              }
            </div>
          </div>
        }
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
  readonly dropdownOpen = signal(false);
  readonly searchQuery = signal('');

  readonly filteredEpics = () => {
    const query = this.searchQuery().toLowerCase();
    if (!query) return this.epics();
    return this.epics().filter(e => e.title.toLowerCase().includes(query));
  };

  constructor() {
    effect(() => {
      const team = this.teamConfigService.selectedTeam();
      if (team) {
        this.fetchEpics(team);
      }
    });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.dropdownOpen.set(false);
    this.searchQuery.set('');
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
    if (!this.dropdownOpen()) {
      this.searchQuery.set('');
    }
  }

  isSelected(epic: Epic): boolean {
    return this.teamConfigService.selectedEpics().some(e => e.id === epic.id);
  }

  onTeamChange(event: Event): void {
    const name = (event.target as HTMLSelectElement).value;
    const team = this.teamConfigService.teams().find(t => t.name === name);
    if (team) {
      this.teamConfigService.selectTeam(team);
    }
  }

  onEpicToggle(epic: Epic): void {
    this.teamConfigService.toggleEpic(epic);
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
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

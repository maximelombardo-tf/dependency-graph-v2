import { Component, inject, signal, effect, untracked, HostListener } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { forkJoin, of } from 'rxjs';
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

      <!-- Epic multi-select -->
      <div class="flex items-center gap-2 relative">
        <label class="text-sm font-medium text-gray-700">Epic</label>
        <button
          class="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-left min-w-[200px] flex items-center justify-between gap-2"
          [disabled]="!teamConfigService.selectedTeam() || loadingEpics()"
          (click)="toggleDropdown('epic', $event)"
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

        @if (openDropdown() === 'epic') {
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
                    [checked]="isEpicSelected(epic)"
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

      <!-- Extra fields picker -->
      @if (teamConfigService.availableExtraFields().length > 0) {
        <div class="flex items-center gap-2 relative">
          <label class="text-sm font-medium text-gray-700">Champs</label>
          <button
            class="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-left min-w-[160px] flex items-center justify-between gap-2"
            (click)="toggleDropdown('fields', $event)"
          >
            <span class="truncate">
              @if (teamConfigService.extraDisplayFields().length === 0) {
                Ajouter des champs
              } @else {
                {{ teamConfigService.extraDisplayFields().join(', ') }}
              }
            </span>
            <svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          @if (openDropdown() === 'fields') {
            <div class="absolute top-full left-8 mt-1 z-50 bg-white rounded-md border border-gray-200 shadow-lg w-64 max-h-64 overflow-y-auto">
              <div class="px-3 py-2 text-xs text-gray-400 border-b border-gray-100">
                Max 2 champs supplémentaires
              </div>
              <div class="py-1">
                @for (field of teamConfigService.availableExtraFields(); track field) {
                  <label
                    class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
                    [class.opacity-50]="!isFieldSelected(field) && teamConfigService.extraDisplayFields().length >= 2"
                    (click)="$event.stopPropagation()"
                  >
                    <input
                      type="checkbox"
                      class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      [checked]="isFieldSelected(field)"
                      [disabled]="!isFieldSelected(field) && teamConfigService.extraDisplayFields().length >= 2"
                      (change)="onFieldToggle(field)"
                    />
                    <span class="truncate">{{ field }}</span>
                  </label>
                }
              </div>
            </div>
          }
        </div>
      }

      @if (loadingEpics()) {
        <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      }
    </div>
  `,
})
export class SelectorComponent {
  readonly teamConfigService = inject(TeamConfigService);
  private readonly notionService = inject(NotionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly epics = signal<Epic[]>([]);
  readonly loadingEpics = signal(false);
  readonly openDropdown = signal<'epic' | 'fields' | null>(null);
  readonly searchQuery = signal('');

  readonly filteredEpics = () => {
    const query = this.searchQuery().toLowerCase();
    if (!query) return this.epics();
    return this.epics().filter(e => e.title.toLowerCase().includes(query));
  };

  constructor() {
    // Select team from URL param when teams are loaded
    effect(() => {
      const teams = this.teamConfigService.teams();
      if (teams.length === 0) return;
      untracked(() => {
        const teamName = this.route.snapshot.paramMap.get('teamName');
        if (teamName) {
          const decoded = decodeURIComponent(teamName);
          const team = teams.find(t => this.slugify(t.name) === decoded || t.name === decoded);
          if (team && team.name !== this.teamConfigService.selectedTeam()?.name) {
            this.teamConfigService.selectTeam(team);
          }
        }
      });
    });

    // Fetch epics when team changes
    effect(() => {
      const team = this.teamConfigService.selectedTeam();
      if (team) {
        untracked(() => this.fetchEpics(team));
      }
    });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.openDropdown.set(null);
    this.searchQuery.set('');
  }

  toggleDropdown(which: 'epic' | 'fields', event: Event): void {
    event.stopPropagation();
    if (this.openDropdown() === which) {
      this.openDropdown.set(null);
      this.searchQuery.set('');
    } else {
      this.openDropdown.set(which);
      this.searchQuery.set('');
    }
  }

  isEpicSelected(epic: Epic): boolean {
    return this.teamConfigService.selectedEpics().some(e => e.id === epic.id);
  }

  isFieldSelected(field: string): boolean {
    return this.teamConfigService.extraDisplayFields().includes(field);
  }

  onTeamChange(event: Event): void {
    const name = (event.target as HTMLSelectElement).value;
    const team = this.teamConfigService.teams().find(t => t.name === name);
    if (team) {
      this.teamConfigService.selectTeam(team);
      // Navigate to URL with team slug
      const currentPath = this.router.url.startsWith('/board') ? 'board' : 'graph';
      this.router.navigate([`/${currentPath}`, this.slugify(team.name)]);
    }
  }

  private slugify(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
  }

  onEpicToggle(epic: Epic): void {
    this.teamConfigService.toggleEpic(epic);
  }

  onFieldToggle(field: string): void {
    this.teamConfigService.toggleDisplayField(field);
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  private fetchEpics(team: TeamConfig): void {
    this.loadingEpics.set(true);

    const epics$ = this.notionService.getEpicsForTeam(team);
    const relevantIds$ = team.ticketFilter?.length
      ? this.notionService.getRelevantEpicIds(team)
      : of(null);

    forkJoin([epics$, relevantIds$]).subscribe({
      next: ([epics, relevantIds]) => {
        const filtered = relevantIds
          ? epics.filter(e => relevantIds.has(e.id))
          : epics;
        this.epics.set(filtered);
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

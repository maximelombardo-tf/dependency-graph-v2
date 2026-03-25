import { Component, inject, signal, effect, computed } from '@angular/core';
import { transferArrayItem, moveItemInArray } from '@angular/cdk/drag-drop';
import { SelectorComponent } from '../selector/selector.component';
import { KanbanColumnComponent } from './kanban-column/kanban-column.component';
import { AuthService } from '../../core/services/auth.service';
import { TeamConfigService } from '../../core/services/team-config.service';
import { NotionService } from '../../core/services/notion.service';
import { Ticket } from '../../core/models/ticket.model';
import { COLUMN_DEFINITIONS, ColumnKey } from '../../core/models/team-config.model';

interface ColumnData {
  key: ColumnKey;
  displayName: string;
  tickets: Ticket[];
}

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [SelectorComponent, KanbanColumnComponent],
  template: `
    <div class="min-h-screen flex flex-col">
      <header class="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
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
        @if (loading()) {
          <div class="flex-1 flex items-center justify-center">
            <div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        } @else if (error()) {
          <div class="flex-1 flex items-center justify-center">
            <div class="p-4 bg-red-50 border border-red-200 rounded-lg max-w-md">
              <p class="text-sm text-red-700">{{ error() }}</p>
              <button class="mt-2 text-sm text-red-600 underline" (click)="fetchTickets()">Réessayer</button>
            </div>
          </div>
        } @else {
          <div class="flex-1 overflow-x-auto p-4">
            <div class="flex gap-4 h-full" style="min-height: calc(100vh - 140px);">
              @for (column of columns(); track column.key) {
                <app-kanban-column
                  [columnName]="column.displayName"
                  [columnId]="column.key"
                  [tickets]="column.tickets"
                  [connectedTo]="columnIds()"
                  (ticketDropped)="onTicketDropped($event)"
                  (linkStart)="onLinkStart($event)"
                  (linkEnd)="onLinkEnd($event)"
                />
              }
            </div>
          </div>
        }
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
  private readonly notionService = inject(NotionService);

  readonly tickets = signal<Ticket[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly columns = computed<ColumnData[]>(() => {
    const team = this.teamConfigService.selectedTeam();
    const allTickets = this.tickets();
    if (!team) return [];

    return COLUMN_DEFINITIONS.map(col => {
      const statusValues = team.propertiesName.statuses[col.key];
      return {
        key: col.key,
        displayName: col.displayName,
        tickets: allTickets.filter(t => statusValues.includes(t.status)),
      };
    });
  });

  readonly columnIds = computed(() => COLUMN_DEFINITIONS.map(c => c.key));

  constructor() {
    effect(() => {
      const team = this.teamConfigService.selectedTeam();
      const epic = this.teamConfigService.selectedEpic();
      if (team && epic) {
        this.fetchTickets();
      }
    });
  }

  fetchTickets(): void {
    const team = this.teamConfigService.selectedTeam();
    const epic = this.teamConfigService.selectedEpic();
    if (!team || !epic) return;

    this.loading.set(true);
    this.error.set(null);

    this.notionService.getTicketsForEpic(team, epic.id).subscribe({
      next: tickets => {
        this.tickets.set(tickets);
        this.loading.set(false);
      },
      error: err => {
        console.error('Failed to fetch tickets:', err);
        this.error.set('Impossible de charger les tickets. Vérifiez votre connexion.');
        this.loading.set(false);
      },
    });
  }

  onTicketDropped(event: { ticket: Ticket; newColumnId: string; previousIndex: number; currentIndex: number }): void {
    const team = this.teamConfigService.selectedTeam();
    if (!team) return;

    const newColumnKey = event.newColumnId as ColumnKey;
    const newStatus = team.propertiesName.statuses[newColumnKey]?.[0];
    if (!newStatus) return;

    const previousStatus = event.ticket.status;

    // Optimistic update
    const updatedTickets = this.tickets().map(t =>
      t.notionId === event.ticket.notionId ? { ...t, status: newStatus } : t
    );
    this.tickets.set(updatedTickets);

    // Update Notion
    this.notionService.updatePageProperty(event.ticket.notionId, {
      [team.propertiesName.status]: { status: { name: newStatus } },
    }).subscribe({
      error: err => {
        console.error('Failed to update ticket status:', err);
        // Revert
        const revertedTickets = this.tickets().map(t =>
          t.notionId === event.ticket.notionId ? { ...t, status: previousStatus } : t
        );
        this.tickets.set(revertedTickets);
      },
    });
  }

  onLinkStart(event: { ticketId: string; side: 'left' | 'right' }): void {
    // Will be implemented in Phase 7
  }

  onLinkEnd(event: { ticketId: string }): void {
    // Will be implemented in Phase 7
  }
}

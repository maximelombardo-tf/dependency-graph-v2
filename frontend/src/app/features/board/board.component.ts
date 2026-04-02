import {
  Component,
  inject,
  signal,
  effect,
  untracked,
  computed,
  ViewChild,
  ElementRef,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { SelectorComponent } from '../selector/selector.component';
import { KanbanColumnComponent } from './kanban-column/kanban-column.component';
import { DependencyOverlayComponent } from './dependency-overlay/dependency-overlay.component';
import { AuthService } from '../../core/services/auth.service';
import { TeamConfigService } from '../../core/services/team-config.service';
import { NotionService } from '../../core/services/notion.service';
import { DependencyService } from '../../core/services/dependency.service';
import { Ticket } from '../../core/models/ticket.model';
import { Dependency } from '../../core/models/dependency.model';
import { COLUMN_DEFINITIONS, ColumnKey } from '../../core/models/team-config.model';
import { ToastService } from '../../shared/components/toast.service';
import { RouterLink } from '@angular/router';

interface ColumnData {
  key: ColumnKey;
  displayName: string;
  tickets: Ticket[];
}

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [SelectorComponent, KanbanColumnComponent, DependencyOverlayComponent, RouterLink],
  template: `
    <div class="min-h-screen flex flex-col">
      <header class="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <div class="flex items-center gap-4">
          <h1 class="text-lg font-semibold text-gray-800">Dependency Graph</h1>
          <nav class="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <a [routerLink]="getNavLink('graph')" class="px-3 py-1 text-sm rounded-md text-gray-600 hover:bg-white transition-colors">Graph</a>
            <span class="px-3 py-1 text-sm rounded-md bg-white shadow-sm font-medium text-gray-900">Kanban</span>
          </nav>
        </div>
        <div class="flex items-center gap-3">
          @if (authService.userName()) {
            <span class="text-sm text-gray-600">{{ authService.userName() }}</span>
          }
          <button
            class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            (click)="fetchTickets()"
            title="Rafraîchir (R)"
          >
            <svg class="w-4 h-4" [class.animate-spin]="loading()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <a routerLink="/admin" class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors" title="Administration">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </a>
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
          <div
            #boardContainer
            class="flex-1 overflow-auto relative"
            [class.cursor-crosshair]="dependencyService.isLinkMode()"
            (mousemove)="onMouseMove($event)"
            (click)="onBoardClick($event)"
          >
            <div class="flex gap-4 p-4" style="min-height: calc(100vh - 140px);">
              @for (column of columns(); track column.key) {
                <app-kanban-column
                  [columnName]="column.displayName"
                  [columnId]="column.key"
                  [tickets]="column.tickets"
                  [connectedTo]="columnIds()"
                  [isLinkMode]="dependencyService.isLinkMode()"
                  (ticketDropped)="onTicketDropped($event)"
                  (linkStart)="onLinkStart($event)"
                  (linkEnd)="onLinkEnd($event)"
                />
              }
            </div>

            <app-dependency-overlay
              [dependencies]="dependencies()"
              [ticketElements]="ticketElementsMap()"
              [scrollContainer]="boardContainerEl!"
              (deleteDependency)="onDeleteDependency($event)"
            />
          </div>
        }
      } @else {
        <div class="flex-1 flex items-center justify-center">
          <p class="text-gray-400">Sélectionnez une équipe et une EPIC pour commencer</p>
        </div>
      }
    </div>
  `,
})
export class BoardComponent implements AfterViewInit {
  readonly authService = inject(AuthService);
  readonly teamConfigService = inject(TeamConfigService);
  readonly dependencyService = inject(DependencyService);
  private readonly notionService = inject(NotionService);
  private readonly toastService = inject(ToastService);

  @ViewChild('boardContainer') boardContainerRef!: ElementRef<HTMLElement>;
  boardContainerEl: HTMLElement | null = null;

  readonly tickets = signal<Ticket[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly dependencies = signal<Dependency[]>([]);
  readonly ticketElementsMap = signal<Map<string, HTMLElement>>(new Map());

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

  getNavLink(target: string): string {
    const team = this.teamConfigService.selectedTeam();
    return team ? `/${target}/${TeamConfigService.slugify(team.name)}` : `/${target}`;
  }

  constructor() {
    effect(() => {
      const team = this.teamConfigService.selectedTeam();
      const epics = this.teamConfigService.selectedEpics();
      if (team && epics.length > 0) {
        untracked(() => this.fetchTickets());
      }
    });
  }

  ngAfterViewInit(): void {
    this.boardContainerEl = this.boardContainerRef?.nativeElement ?? null;
    // Refresh ticket element map after view renders
    setTimeout(() => this.refreshTicketElementMap(), 100);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.dependencyService.cancelLink();
  }

  @HostListener('document:keydown.r', ['$event'])
  onRefreshKey(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
    this.fetchTickets();
  }

  fetchTickets(): void {
    const team = this.teamConfigService.selectedTeam();
    const epics = this.teamConfigService.selectedEpics();
    if (!team || epics.length === 0) return;

    this.loading.set(true);
    this.error.set(null);

    this.notionService.getTicketsForEpics(team, epics.map(e => e.id)).subscribe({
      next: tickets => {
        this.tickets.set(tickets);
        this.updateAvailableFields(tickets);
        const deps = this.dependencyService.buildDependenciesFromTickets(tickets);
        this.dependencies.set(deps);
        this.loading.set(false);
        setTimeout(() => this.refreshTicketElementMap(), 100);
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
    setTimeout(() => this.refreshTicketElementMap(), 50);

    this.notionService.updatePageProperty(event.ticket.notionId, {
      [team.propertiesName.status]: { select: { name: newStatus } },
    }).subscribe({
      error: err => {
        console.error('Failed to update ticket status:', err);
        this.toastService.error('Erreur lors du déplacement du ticket. Changement annulé.');
        const revertedTickets = this.tickets().map(t =>
          t.notionId === event.ticket.notionId ? { ...t, status: previousStatus } : t
        );
        this.tickets.set(revertedTickets);
      },
    });
  }

  onLinkStart(event: { ticketId: string; side: 'left' | 'right' }): void {
    this.dependencyService.startLink(event.ticketId, event.side);
  }

  onLinkEnd(event: { ticketId: string }): void {
    const source = this.dependencyService.linkSource();
    if (!source || source.ticketId === event.ticketId) {
      this.dependencyService.cancelLink();
      return;
    }

    const team = this.teamConfigService.selectedTeam();
    if (!team) return;

    const fromTicket = this.tickets().find(t => t.notionId === source.ticketId);
    if (!fromTicket) return;

    // Optimistic update
    this.dependencyService.addDependency(source.ticketId, event.ticketId);
    this.dependencies.set(this.dependencyService.dependencies());

    // Update ticket in local state
    const updatedTickets = this.tickets().map(t =>
      t.notionId === source.ticketId
        ? { ...t, dependencyIds: [...t.dependencyIds, event.ticketId] }
        : t
    );
    this.tickets.set(updatedTickets);

    // Sync with Notion
    this.notionService.addDependency(
      source.ticketId,
      fromTicket.dependencyIds,
      event.ticketId,
      team.propertiesName.bloque,
    ).subscribe({
      error: err => {
        console.error('Failed to add dependency:', err);
        this.toastService.error('Erreur lors de la création de la dépendance.');
        this.dependencyService.removeDependency(source.ticketId, event.ticketId);
        this.dependencies.set(this.dependencyService.dependencies());
        // Revert ticket
        const revertedTickets = this.tickets().map(t =>
          t.notionId === source.ticketId
            ? { ...t, dependencyIds: t.dependencyIds.filter(id => id !== event.ticketId) }
            : t
        );
        this.tickets.set(revertedTickets);
      },
    });
  }

  onDeleteDependency(event: { fromTicketId: string; toTicketId: string }): void {
    const team = this.teamConfigService.selectedTeam();
    if (!team) return;

    const fromTicket = this.tickets().find(t => t.notionId === event.fromTicketId);
    if (!fromTicket) return;

    // Optimistic update
    this.dependencyService.removeDependency(event.fromTicketId, event.toTicketId);
    this.dependencies.set(this.dependencyService.dependencies());

    const updatedTickets = this.tickets().map(t =>
      t.notionId === event.fromTicketId
        ? { ...t, dependencyIds: t.dependencyIds.filter(id => id !== event.toTicketId) }
        : t
    );
    this.tickets.set(updatedTickets);

    this.notionService.removeDependency(
      event.fromTicketId,
      fromTicket.dependencyIds,
      event.toTicketId,
      team.propertiesName.bloque,
    ).subscribe({
      error: err => {
        console.error('Failed to remove dependency:', err);
        this.toastService.error('Erreur lors de la suppression de la dépendance.');
        this.dependencyService.addDependency(event.fromTicketId, event.toTicketId);
        this.dependencies.set(this.dependencyService.dependencies());
        const revertedTickets = this.tickets().map(t =>
          t.notionId === event.fromTicketId
            ? { ...t, dependencyIds: [...t.dependencyIds, event.toTicketId] }
            : t
        );
        this.tickets.set(revertedTickets);
      },
    });
  }

  onMouseMove(event: MouseEvent): void {
    if (this.dependencyService.isLinkMode()) {
      this.dependencyService.pendingMousePos.set({ x: event.clientX, y: event.clientY });
    }
  }

  onBoardClick(event: MouseEvent): void {
    if (this.dependencyService.isLinkMode()) {
      this.dependencyService.cancelLink();
    }
  }

  private updateAvailableFields(tickets: Ticket[]): void {
    const fieldSet = new Set<string>();
    for (const t of tickets) {
      for (const key of Object.keys(t.extraFields)) {
        fieldSet.add(key);
      }
    }
    this.teamConfigService.setAvailableExtraFields(Array.from(fieldSet));
  }

  private refreshTicketElementMap(): void {
    const container = this.boardContainerRef?.nativeElement;
    if (!container) return;

    const map = new Map<string, HTMLElement>();
    const cards = container.querySelectorAll<HTMLElement>('[data-ticket-id]');
    cards.forEach(card => {
      const id = card.getAttribute('data-ticket-id');
      if (id) map.set(id, card);
    });
    this.ticketElementsMap.set(map);
  }
}

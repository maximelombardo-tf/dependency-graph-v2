import {
  Component,
  inject,
  signal,
  computed,
  effect,
  ElementRef,
  ViewChild,
  AfterViewInit,
  HostListener,
  ChangeDetectionStrategy,
} from '@angular/core';
import { SelectorComponent } from '../selector/selector.component';
import { AuthService } from '../../core/services/auth.service';
import { TeamConfigService } from '../../core/services/team-config.service';
import { NotionService } from '../../core/services/notion.service';
import { ToastService } from '../../shared/components/toast.service';
import { Ticket } from '../../core/models/ticket.model';
import { Dependency } from '../../core/models/dependency.model';
import { RouterLink } from '@angular/router';

interface GraphNode {
  ticket: Ticket;
  x: number;
  y: number;
  dragging: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
}

@Component({
  selector: 'app-graph',
  standalone: true,
  imports: [SelectorComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen flex flex-col">
      <header class="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <div class="flex items-center gap-4">
          <h1 class="text-lg font-semibold text-gray-800">Dependency Graph</h1>
          <nav class="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <a routerLink="/board" class="px-3 py-1 text-sm rounded-md text-gray-600 hover:bg-white transition-colors">Kanban</a>
            <span class="px-3 py-1 text-sm rounded-md bg-white shadow-sm font-medium text-gray-900">Graph</span>
          </nav>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-400">
            @if (linkSource()) {
              Cliquez sur un ticket cible (ESC pour annuler)
            } @else {
              Scroll: zoom / Drag fond: pan / Drag carte: déplacer / Points: lier
            }
          </span>
          <button
            class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            (click)="autoLayout()"
            title="Auto-layout"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          @if (authService.userName()) {
            <span class="text-sm text-gray-600">{{ authService.userName() }}</span>
          }
          <button class="text-sm text-gray-500 hover:text-gray-700 underline" (click)="authService.logout()">Déconnexion</button>
        </div>
      </header>

      <app-selector />

      @if (teamConfigService.hasSelection()) {
        @if (loading()) {
          <div class="flex-1 flex items-center justify-center">
            <div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        } @else {
          <div
            #canvas
            class="flex-1 overflow-hidden relative bg-gray-50"
            [class.cursor-crosshair]="!!linkSource()"
            [class.cursor-grab]="!linkSource() && !draggingNode"
            style="background-image: radial-gradient(circle, #d1d5db 1px, transparent 1px); background-size: 24px 24px;"
            (mousedown)="onCanvasMouseDown($event)"
            (mousemove)="onCanvasMouseMove($event)"
            (mouseup)="onCanvasMouseUp($event)"
            (mouseleave)="onCanvasMouseUp($event)"
            (wheel)="onWheel($event)"
          >
            <div
              class="absolute origin-top-left"
              [style.transform]="'translate(' + panX() + 'px, ' + panY() + 'px) scale(' + zoom() + ')'"
            >
              <!-- SVG edges -->
              <svg
                class="absolute top-0 left-0 pointer-events-none"
                [attr.width]="svgSize()"
                [attr.height]="svgSize()"
                style="overflow: visible"
              >
                <defs>
                  <marker id="graph-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#9CA3AF" />
                  </marker>
                  <marker id="graph-arrow-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#3B82F6" />
                  </marker>
                  <marker id="graph-arrow-red" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#EF4444" />
                  </marker>
                </defs>

                <!-- Existing edges -->
                @for (edge of edgePaths(); track edge.id) {
                  <g class="pointer-events-auto">
                    <!-- Wide invisible hit area -->
                    <path
                      [attr.d]="edge.path"
                      fill="none"
                      stroke="transparent"
                      stroke-width="16"
                      class="cursor-pointer"
                      (contextmenu)="onEdgeRightClick($event, edge)"
                    />
                    <!-- Visible path -->
                    <path
                      [attr.d]="edge.path"
                      fill="none"
                      stroke="#9CA3AF"
                      stroke-width="2"
                      marker-end="url(#graph-arrow)"
                      class="pointer-events-none transition-colors"
                    />
                  </g>
                }

                <!-- Pending link arrow -->
                @if (pendingEdgePath()) {
                  <path
                    [attr.d]="pendingEdgePath()"
                    fill="none"
                    stroke="#3B82F6"
                    stroke-width="2"
                    stroke-dasharray="8 4"
                    marker-end="url(#graph-arrow-blue)"
                  />
                }
              </svg>

              <!-- Ticket nodes -->
              @for (node of nodes(); track node.ticket.notionId) {
                <div
                  class="absolute select-none group"
                  [style.left.px]="node.x"
                  [style.top.px]="node.y"
                  [style.z-index]="node.dragging ? 50 : 10"
                  (mousedown)="onNodeMouseDown($event, node)"
                >
                  <!-- Connection dot: left -->
                  <div
                    class="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md z-20 transition-all opacity-0 group-hover:opacity-100"
                    [class.bg-blue-500]="!!linkSource()"
                    [class.bg-gray-700]="!linkSource()"
                    [class.opacity-100]="!!linkSource()"
                    [class.hover:scale-150]="true"
                    [class.cursor-pointer]="true"
                    (mousedown)="onDotMouseDown($event, node, 'left')"
                    (mouseup)="onDotMouseUp($event, node)"
                  ></div>

                  <!-- Connection dot: right -->
                  <div
                    class="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md z-20 transition-all opacity-0 group-hover:opacity-100"
                    [class.bg-blue-500]="!!linkSource()"
                    [class.bg-gray-700]="!linkSource()"
                    [class.opacity-100]="!!linkSource()"
                    [class.hover:scale-150]="true"
                    [class.cursor-pointer]="true"
                    (mousedown)="onDotMouseDown($event, node, 'right')"
                    (mouseup)="onDotMouseUp($event, node)"
                  ></div>

                  <div
                    class="w-56 bg-white rounded-lg border-2 p-3 shadow-md hover:shadow-lg transition-all"
                    [class.border-blue-400]="node.dragging"
                    [class.border-green-400]="!!linkSource() && linkSource()!.ticketId !== node.ticket.notionId"
                    [class.border-gray-200]="!node.dragging && !(!!linkSource() && linkSource()!.ticketId !== node.ticket.notionId)"
                    [class.ring-2]="node.dragging"
                    [class.ring-blue-200]="node.dragging"
                    [class.cursor-grab]="!linkSource()"
                    [class.cursor-pointer]="!!linkSource()"
                    (click)="onNodeClick($event, node)"
                  >
                    <a
                      [href]="node.ticket.notionUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-sm font-medium text-gray-900 hover:text-blue-600 line-clamp-2 block"
                      (mousedown)="$event.stopPropagation()"
                      (click)="$event.stopPropagation()"
                    >
                      {{ node.ticket.title }}
                    </a>
                    <div class="mt-1.5 flex items-center justify-between">
                      <span class="text-xs text-gray-400">{{ node.ticket.id }}</span>
                      <div class="flex gap-1">
                        @if (node.ticket.complexity) {
                          <span class="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{{ node.ticket.complexity }}</span>
                        }
                        @if (node.ticket.assignee) {
                          <span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 max-w-[70px] truncate">{{ node.ticket.assignee }}</span>
                        }
                      </div>
                    </div>
                    @if (node.ticket.dependencyIds.length > 0) {
                      <div class="mt-1 text-xs text-orange-600">
                        Bloque {{ node.ticket.dependencyIds.length }} ticket{{ node.ticket.dependencyIds.length > 1 ? 's' : '' }}
                      </div>
                    }
                  </div>
                </div>
              }
            </div>

            <!-- Context menu -->
            @if (contextMenu()) {
              <div
                class="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1"
                [style.left.px]="contextMenu()!.x"
                [style.top.px]="contextMenu()!.y"
              >
                <button
                  class="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                  (click)="deleteEdge()"
                >
                  Supprimer la dépendance
                </button>
              </div>
            }
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
export class GraphComponent implements AfterViewInit {
  readonly authService = inject(AuthService);
  readonly teamConfigService = inject(TeamConfigService);
  private readonly notionService = inject(NotionService);
  private readonly toastService = inject(ToastService);

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLElement>;

  readonly tickets = signal<Ticket[]>([]);
  readonly nodes = signal<GraphNode[]>([]);
  readonly edges = signal<GraphEdge[]>([]);
  readonly loading = signal(false);

  readonly zoom = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly svgSize = signal(5000);

  // Link mode
  readonly linkSource = signal<{ ticketId: string; side: 'left' | 'right' } | null>(null);
  readonly mousePos = signal<{ x: number; y: number } | null>(null);

  // Context menu
  readonly contextMenu = signal<{ x: number; y: number; edge: GraphEdge } | null>(null);

  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  draggingNode: GraphNode | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  static readonly NODE_WIDTH = 224;
  static readonly NODE_HEIGHT = 90;

  readonly edgePaths = computed(() => {
    const nodeList = this.nodes();
    const edgeList = this.edges();
    const nodeMap = new Map(nodeList.map(n => [n.ticket.notionId, n]));

    return edgeList
      .map(e => {
        const from = nodeMap.get(e.from);
        const to = nodeMap.get(e.to);
        if (!from || !to) return null;

        const path = this.computeEdgePath(from, to);
        return { id: `${e.from}-${e.to}`, path, from: e.from, to: e.to };
      })
      .filter((e): e is { id: string; path: string; from: string; to: string } => e !== null);
  });

  readonly pendingEdgePath = computed(() => {
    const source = this.linkSource();
    const mouse = this.mousePos();
    if (!source || !mouse) return null;

    const nodeList = this.nodes();
    const sourceNode = nodeList.find(n => n.ticket.notionId === source.ticketId);
    if (!sourceNode) return null;

    const fromX = source.side === 'right'
      ? sourceNode.x + GraphComponent.NODE_WIDTH
      : sourceNode.x;
    const fromY = sourceNode.y + GraphComponent.NODE_HEIGHT / 2;

    // Convert mouse pos (screen) to graph coordinates
    const z = this.zoom();
    const toX = (mouse.x - this.panX()) / z;
    const toY = (mouse.y - this.panY()) / z;

    const dx = Math.abs(toX - fromX);
    const offset = Math.max(60, dx * 0.4);

    return `M ${fromX} ${fromY} C ${fromX + offset} ${fromY}, ${toX - offset} ${toY}, ${toX} ${toY}`;
  });

  constructor() {
    effect(() => {
      const team = this.teamConfigService.selectedTeam();
      const epic = this.teamConfigService.selectedEpic();
      if (team && epic) {
        this.fetchTickets();
      }
    });
  }

  ngAfterViewInit(): void {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.cancelLink();
    this.contextMenu.set(null);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.contextMenu.set(null);
  }

  // --- Link mode ---

  onDotMouseDown(event: MouseEvent, node: GraphNode, side: 'left' | 'right'): void {
    event.stopPropagation();
    event.preventDefault();
    this.linkSource.set({ ticketId: node.ticket.notionId, side });
  }

  onDotMouseUp(event: MouseEvent, node: GraphNode): void {
    event.stopPropagation();
    this.completeLink(node.ticket.notionId);
  }

  onNodeClick(event: MouseEvent, node: GraphNode): void {
    if (this.linkSource()) {
      event.stopPropagation();
      this.completeLink(node.ticket.notionId);
    }
  }

  private completeLink(targetId: string): void {
    const source = this.linkSource();
    if (!source || source.ticketId === targetId) {
      this.cancelLink();
      return;
    }

    // Check if edge already exists
    const exists = this.edges().some(e => e.from === source.ticketId && e.to === targetId);
    if (exists) {
      this.toastService.error('Cette dépendance existe déjà.');
      this.cancelLink();
      return;
    }

    const team = this.teamConfigService.selectedTeam();
    if (!team) return;

    const fromTicket = this.tickets().find(t => t.notionId === source.ticketId);
    if (!fromTicket) return;

    // Optimistic update
    this.edges.update(edges => [...edges, { from: source.ticketId, to: targetId }]);
    this.tickets.update(tickets =>
      tickets.map(t =>
        t.notionId === source.ticketId
          ? { ...t, dependencyIds: [...t.dependencyIds, targetId] }
          : t
      )
    );
    this.nodes.update(nodes =>
      nodes.map(n =>
        n.ticket.notionId === source.ticketId
          ? { ...n, ticket: { ...n.ticket, dependencyIds: [...n.ticket.dependencyIds, targetId] } }
          : n
      )
    );
    this.cancelLink();

    // Sync Notion
    this.notionService.addDependency(
      source.ticketId,
      fromTicket.dependencyIds,
      targetId,
      team.propertiesName.bloque,
    ).subscribe({
      next: () => this.toastService.success('Dépendance créée.'),
      error: err => {
        console.error('Failed to add dependency:', err);
        this.toastService.error('Erreur lors de la création de la dépendance.');
        // Revert
        this.edges.update(edges => edges.filter(e => !(e.from === source.ticketId && e.to === targetId)));
        this.tickets.update(tickets =>
          tickets.map(t =>
            t.notionId === source.ticketId
              ? { ...t, dependencyIds: t.dependencyIds.filter(id => id !== targetId) }
              : t
          )
        );
        this.nodes.update(nodes =>
          nodes.map(n =>
            n.ticket.notionId === source.ticketId
              ? { ...n, ticket: { ...n.ticket, dependencyIds: n.ticket.dependencyIds.filter(id => id !== targetId) } }
              : n
          )
        );
      },
    });
  }

  cancelLink(): void {
    this.linkSource.set(null);
    this.mousePos.set(null);
  }

  // --- Delete edge ---

  onEdgeRightClick(event: MouseEvent, edge: { id: string; from: string; to: string }): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.set({ x: event.clientX, y: event.clientY, edge: { from: edge.from, to: edge.to } });
  }

  deleteEdge(): void {
    const menu = this.contextMenu();
    if (!menu) return;

    const team = this.teamConfigService.selectedTeam();
    if (!team) return;

    const fromTicket = this.tickets().find(t => t.notionId === menu.edge.from);
    if (!fromTicket) return;

    const { from, to } = menu.edge;

    // Optimistic update
    this.edges.update(edges => edges.filter(e => !(e.from === from && e.to === to)));
    this.tickets.update(tickets =>
      tickets.map(t =>
        t.notionId === from
          ? { ...t, dependencyIds: t.dependencyIds.filter(id => id !== to) }
          : t
      )
    );
    this.nodes.update(nodes =>
      nodes.map(n =>
        n.ticket.notionId === from
          ? { ...n, ticket: { ...n.ticket, dependencyIds: n.ticket.dependencyIds.filter(id => id !== to) } }
          : n
      )
    );
    this.contextMenu.set(null);

    // Sync Notion
    this.notionService.removeDependency(
      from,
      fromTicket.dependencyIds,
      to,
      team.propertiesName.bloque,
    ).subscribe({
      next: () => this.toastService.success('Dépendance supprimée.'),
      error: err => {
        console.error('Failed to remove dependency:', err);
        this.toastService.error('Erreur lors de la suppression.');
        // Revert
        this.edges.update(edges => [...edges, { from, to }]);
        this.tickets.update(tickets =>
          tickets.map(t =>
            t.notionId === from
              ? { ...t, dependencyIds: [...t.dependencyIds, to] }
              : t
          )
        );
        this.nodes.update(nodes =>
          nodes.map(n =>
            n.ticket.notionId === from
              ? { ...n, ticket: { ...n.ticket, dependencyIds: [...n.ticket.dependencyIds, to] } }
              : n
          )
        );
      },
    });
  }

  // --- Data loading ---

  fetchTickets(): void {
    const team = this.teamConfigService.selectedTeam();
    const epic = this.teamConfigService.selectedEpic();
    if (!team || !epic) return;

    this.loading.set(true);
    this.notionService.getTicketsForEpic(team, epic.id).subscribe({
      next: tickets => {
        this.tickets.set(tickets);
        this.buildGraph(tickets);
        this.loading.set(false);
      },
      error: err => {
        console.error('Failed to fetch tickets:', err);
        this.toastService.error('Impossible de charger les tickets.');
        this.loading.set(false);
      },
    });
  }

  private buildGraph(tickets: Ticket[]): void {
    const ticketIds = new Set(tickets.map(t => t.notionId));

    const edges: GraphEdge[] = [];
    for (const ticket of tickets) {
      for (const depId of ticket.dependencyIds) {
        if (ticketIds.has(depId)) {
          edges.push({ from: ticket.notionId, to: depId });
        }
      }
    }
    this.edges.set(edges);

    const nodes = this.computeLayout(tickets, edges);
    this.nodes.set(nodes);
    this.centerView(nodes);
  }

  private computeLayout(tickets: Ticket[], edges: GraphEdge[]): GraphNode[] {
    const incomingCount = new Map<string, number>();
    const outgoing = new Map<string, string[]>();
    tickets.forEach(t => {
      incomingCount.set(t.notionId, 0);
      outgoing.set(t.notionId, []);
    });
    edges.forEach(e => {
      incomingCount.set(e.to, (incomingCount.get(e.to) || 0) + 1);
      outgoing.get(e.from)?.push(e.to);
    });

    const layers = new Map<string, number>();
    const queue: string[] = [];

    tickets.forEach(t => {
      if ((incomingCount.get(t.notionId) || 0) === 0) {
        layers.set(t.notionId, 0);
        queue.push(t.notionId);
      }
    });

    while (queue.length > 0) {
      const id = queue.shift()!;
      const layer = layers.get(id) || 0;
      for (const depId of outgoing.get(id) || []) {
        const current = layers.get(depId);
        if (current === undefined || current < layer + 1) {
          layers.set(depId, layer + 1);
          queue.push(depId);
        }
      }
    }

    tickets.forEach(t => {
      if (!layers.has(t.notionId)) layers.set(t.notionId, 0);
    });

    const layerGroups = new Map<number, Ticket[]>();
    tickets.forEach(t => {
      const layer = layers.get(t.notionId) || 0;
      if (!layerGroups.has(layer)) layerGroups.set(layer, []);
      layerGroups.get(layer)!.push(t);
    });

    const colGap = 320;
    const rowGap = 130;
    const nodes: GraphNode[] = [];

    for (const [layer, group] of layerGroups) {
      group.forEach((ticket, index) => {
        nodes.push({
          ticket,
          x: layer * colGap + 100,
          y: index * rowGap + 100,
          dragging: false,
        });
      });
    }

    return nodes;
  }

  private centerView(nodes: GraphNode[]): void {
    if (nodes.length === 0) return;

    setTimeout(() => {
      const canvas = this.canvasRef?.nativeElement;
      if (!canvas) return;

      const minX = Math.min(...nodes.map(n => n.x));
      const minY = Math.min(...nodes.map(n => n.y));
      const maxX = Math.max(...nodes.map(n => n.x + GraphComponent.NODE_WIDTH));
      const maxY = Math.max(...nodes.map(n => n.y + GraphComponent.NODE_HEIGHT));

      const graphW = maxX - minX;
      const graphH = maxY - minY;
      const canvasW = canvas.clientWidth;
      const canvasH = canvas.clientHeight;

      const scaleX = canvasW / (graphW + 200);
      const scaleY = canvasH / (graphH + 200);
      const newZoom = Math.min(scaleX, scaleY, 1);

      this.zoom.set(newZoom);
      this.panX.set((canvasW - graphW * newZoom) / 2 - minX * newZoom);
      this.panY.set((canvasH - graphH * newZoom) / 2 - minY * newZoom);
    }, 50);
  }

  autoLayout(): void {
    const tickets = this.tickets();
    if (tickets.length === 0) return;
    const nodes = this.computeLayout(tickets, this.edges());
    this.nodes.set(nodes);
    this.centerView(nodes);
  }

  private computeEdgePath(from: GraphNode, to: GraphNode): string {
    const fromCx = from.x + GraphComponent.NODE_WIDTH;
    const fromCy = from.y + GraphComponent.NODE_HEIGHT / 2;
    const toCx = to.x;
    const toCy = to.y + GraphComponent.NODE_HEIGHT / 2;

    const dx = Math.abs(toCx - fromCx);
    const offset = Math.max(60, dx * 0.4);

    return `M ${fromCx} ${fromCy} C ${fromCx + offset} ${fromCy}, ${toCx - offset} ${toCy}, ${toCx} ${toCy}`;
  }

  // --- Pan & Zoom ---

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(3, this.zoom() * delta));

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const scale = newZoom / this.zoom();
    this.panX.set(mouseX - scale * (mouseX - this.panX()));
    this.panY.set(mouseY - scale * (mouseY - this.panY()));
    this.zoom.set(newZoom);
  }

  onCanvasMouseDown(event: MouseEvent): void {
    if (this.linkSource()) {
      // Clicking on empty space cancels link mode
      this.cancelLink();
      return;
    }
    if (this.draggingNode) return;
    this.isPanning = true;
    this.panStartX = event.clientX - this.panX();
    this.panStartY = event.clientY - this.panY();
  }

  onCanvasMouseMove(event: MouseEvent): void {
    // Update mouse position for pending link arrow
    if (this.linkSource()) {
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      this.mousePos.set({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    }

    if (this.draggingNode) {
      const z = this.zoom();
      const newX = (event.clientX - this.panX()) / z - this.dragOffsetX;
      const newY = (event.clientY - this.panY()) / z - this.dragOffsetY;

      this.nodes.update(nodes =>
        nodes.map(n =>
          n.ticket.notionId === this.draggingNode!.ticket.notionId
            ? { ...n, x: newX, y: newY }
            : n
        )
      );
    } else if (this.isPanning) {
      this.panX.set(event.clientX - this.panStartX);
      this.panY.set(event.clientY - this.panStartY);
    }
  }

  onCanvasMouseUp(event?: MouseEvent): void {
    if (this.draggingNode) {
      this.nodes.update(nodes =>
        nodes.map(n =>
          n.ticket.notionId === this.draggingNode!.ticket.notionId
            ? { ...n, dragging: false }
            : n
        )
      );
      this.draggingNode = null;
    }
    this.isPanning = false;
  }

  onNodeMouseDown(event: MouseEvent, node: GraphNode): void {
    if (this.linkSource()) return; // Don't start drag in link mode
    event.stopPropagation();
    const z = this.zoom();
    this.dragOffsetX = (event.clientX - this.panX()) / z - node.x;
    this.dragOffsetY = (event.clientY - this.panY()) / z - node.y;
    this.draggingNode = node;

    this.nodes.update(nodes =>
      nodes.map(n =>
        n.ticket.notionId === node.ticket.notionId
          ? { ...n, dragging: true }
          : n
      )
    );
  }
}

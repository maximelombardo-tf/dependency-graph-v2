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
import { COLUMN_DEFINITIONS, ColumnKey } from '../../core/models/team-config.model';
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

interface GraphGroup {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string; // hex color
}

const GROUP_COLORS = [
  { name: 'Bleu',   hex: '#3B82F6' },
  { name: 'Vert',   hex: '#22C55E' },
  { name: 'Violet', hex: '#8B5CF6' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Rose',   hex: '#EC4899' },
  { name: 'Jaune',  hex: '#EAB308' },
  { name: 'Rouge',  hex: '#EF4444' },
  { name: 'Cyan',   hex: '#06B6D4' },
];

function getStatusColor(columnKey: ColumnKey | null): { bg: string; border: string } {
  const colorMap: Record<ColumnKey, { bg: string; border: string }> = {
    backlogToPrepare: { bg: 'bg-gray-50',    border: 'border-gray-300' },
    toChallenge:      { bg: 'bg-amber-50',   border: 'border-amber-300' },
    toStrat:          { bg: 'bg-purple-50',  border: 'border-purple-300' },
    toDev:            { bg: 'bg-green-50',   border: 'border-green-300' },
    sprintBacklog:    { bg: 'bg-slate-50',   border: 'border-slate-300' },
    isInProgress:     { bg: 'bg-blue-50',    border: 'border-blue-400' },
    toValidate:       { bg: 'bg-indigo-50',  border: 'border-indigo-300' },
    blocked:          { bg: 'bg-red-50',     border: 'border-red-400' },
    done:             { bg: 'bg-emerald-50', border: 'border-emerald-300' },
  };
  return columnKey ? colorMap[columnKey] : { bg: 'bg-gray-50', border: 'border-gray-300' };
}

const LEGEND_ITEMS: { key: ColumnKey; label: string; dotClass: string }[] = [
  { key: 'backlogToPrepare', label: 'Backlog à préparer', dotClass: 'bg-gray-400' },
  { key: 'toChallenge',      label: 'A challenger',       dotClass: 'bg-amber-400' },
  { key: 'toStrat',          label: 'A strater',          dotClass: 'bg-purple-400' },
  { key: 'toDev',            label: 'Prêt pour le dev',   dotClass: 'bg-green-400' },
  { key: 'sprintBacklog',    label: 'Sprint Backlog',     dotClass: 'bg-slate-400' },
  { key: 'isInProgress',     label: 'En cours',           dotClass: 'bg-blue-500' },
  { key: 'toValidate',       label: 'A valider',          dotClass: 'bg-indigo-400' },
  { key: 'blocked',          label: 'Bloqué',             dotClass: 'bg-red-500' },
  { key: 'done',             label: 'En prod',            dotClass: 'bg-emerald-400' },
];

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
            <span class="px-3 py-1 text-sm rounded-md bg-white shadow-sm font-medium text-gray-900">Graph</span>
            <a routerLink="/board" class="px-3 py-1 text-sm rounded-md text-gray-600 hover:bg-white transition-colors">Kanban</a>
          </nav>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-400">
            @if (linkSource()) {
              Cliquez sur un ticket cible (ESC pour annuler)
            } @else {
              Points: lier / Clic: changer statut / Clic droit flèche: supprimer
            }
          </span>
          <button
            class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            (click)="addGroup()"
            title="Ajouter un groupe"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
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
          <a routerLink="/admin" class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors" title="Administration">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </a>
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
          <div class="flex-1 relative">
            <!-- Legend -->
            <div class="absolute top-3 left-3 z-30 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-sm p-3">
              <div class="text-xs font-semibold text-gray-500 mb-2">Statut</div>
              <div class="flex flex-col gap-1.5">
                @for (item of legendItems; track item.key) {
                  <div class="flex items-center gap-2">
                    <div class="w-2.5 h-2.5 rounded-full shrink-0" [class]="item.dotClass"></div>
                    <span class="text-xs text-gray-600 whitespace-nowrap">{{ item.label }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- Canvas -->
            <div
              #canvas
              class="absolute inset-0 overflow-hidden bg-gray-50"
              [class.cursor-crosshair]="!!linkSource()"
              [class.cursor-default]="!linkSource()"
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
                <!-- Group rectangles -->
                @for (group of groups(); track group.id) {
                  <div
                    class="absolute rounded-xl border-2 select-none"
                    [style.left.px]="group.x"
                    [style.top.px]="group.y"
                    [style.width.px]="group.w"
                    [style.height.px]="group.h"
                    [style.background-color]="group.color + '18'"
                    [style.border-color]="group.color + '60'"
                    [style.z-index]="1"
                    (mousedown)="onGroupMouseDown($event, group)"
                  >
                    <!-- Label -->
                    <div class="absolute -top-7 left-2 flex items-center gap-2">
                      <input
                        class="text-sm font-semibold bg-transparent outline-none border-b border-transparent focus:border-gray-400 max-w-48"
                        [style.color]="group.color"
                        [value]="group.label"
                        (input)="onGroupLabelChange(group, $event)"
                        (mousedown)="$event.stopPropagation()"
                      />
                    </div>

                    <!-- Color picker & delete (top-right) -->
                    <div class="absolute -top-7 right-0 flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity" style="pointer-events: auto;" (mousedown)="$event.stopPropagation()">
                      @for (c of groupColors; track c.hex) {
                        <button
                          class="w-4 h-4 rounded-full border border-white shadow-sm"
                          [style.background-color]="c.hex"
                          [title]="c.name"
                          (click)="setGroupColor(group, c.hex)"
                        ></button>
                      }
                      <button
                        class="w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-500 flex items-center justify-center text-xs leading-none shadow-sm"
                        title="Supprimer le groupe"
                        (click)="removeGroup(group.id)"
                      >&times;</button>
                    </div>

                    <!-- Resize handle (bottom-right) -->
                    <div
                      class="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
                      (mousedown)="onGroupResizeMouseDown($event, group)"
                    >
                      <svg class="w-4 h-4 text-gray-400" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="12" cy="12" r="1.5"/>
                        <circle cx="8" cy="12" r="1.5"/>
                        <circle cx="12" cy="8" r="1.5"/>
                      </svg>
                    </div>
                  </div>
                }

                <!-- SVG edges -->
                <svg class="absolute top-0 left-0 pointer-events-none" [attr.width]="svgSize()" [attr.height]="svgSize()" style="overflow: visible">
                  <defs>
                    <marker id="graph-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#9CA3AF" />
                    </marker>
                    <marker id="graph-arrow-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#3B82F6" />
                    </marker>
                  </defs>

                  @for (edge of edgePaths(); track edge.id) {
                    <g class="pointer-events-auto">
                      <path [attr.d]="edge.path" fill="none" stroke="transparent" stroke-width="16" class="cursor-pointer" (contextmenu)="onEdgeRightClick($event, edge)" />
                      <path [attr.d]="edge.path" fill="none" stroke="#9CA3AF" stroke-width="2" marker-end="url(#graph-arrow)" class="pointer-events-none" />
                    </g>
                  }

                  @if (pendingEdgePath()) {
                    <path [attr.d]="pendingEdgePath()" fill="none" stroke="#3B82F6" stroke-width="2" stroke-dasharray="8 4" marker-end="url(#graph-arrow-blue)" />
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
                    [class.ring-2]="selectedNodeIds().has(node.ticket.notionId) && !node.dragging"
                    [class.ring-blue-400]="selectedNodeIds().has(node.ticket.notionId) && !node.dragging"
                  >
                    <!-- Connection dot: top -->
                    <div
                      class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md z-20 transition-all cursor-pointer opacity-0 group-hover:opacity-100 hover:scale-150"
                      [class.bg-blue-500]="!!linkSource()"
                      [class.bg-gray-700]="!linkSource()"
                      [class.opacity-100]="!!linkSource()"
                      (mousedown)="onDotMouseDown($event, node, 'top')"
                      (mouseup)="onDotMouseUp($event, node)"
                    ></div>

                    <!-- Connection dot: bottom -->
                    <div
                      class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md z-20 transition-all cursor-pointer opacity-0 group-hover:opacity-100 hover:scale-150"
                      [class.bg-blue-500]="!!linkSource()"
                      [class.bg-gray-700]="!linkSource()"
                      [class.opacity-100]="!!linkSource()"
                      (mousedown)="onDotMouseDown($event, node, 'bottom')"
                      (mouseup)="onDotMouseUp($event, node)"
                    ></div>

                    <div
                      class="w-60 rounded-lg border-2 p-3 shadow-md hover:shadow-lg transition-all cursor-pointer"
                      [class]="getNodeColorClasses(node)"
                      [class.ring-2]="node.dragging"
                      [class.ring-blue-200]="node.dragging"
                      (click)="onNodeClick($event, node)"
                    >
                      <span class="text-sm font-medium text-gray-900 line-clamp-2 block">
                        {{ node.ticket.title }}
                      </span>

                      <div class="mt-1.5 flex items-center gap-2">
                        <span class="text-xs text-gray-400">{{ node.ticket.id }}</span>
                        @if (node.ticket.complexity) {
                          <span class="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{{ node.ticket.complexity }}</span>
                        }
                      </div>

                      @if (node.ticket.assignees.length > 0) {
                        <div class="mt-2 flex items-center gap-1">
                          @for (person of node.ticket.assignees; track person.name) {
                            @if (person.avatarUrl) {
                              <img [src]="person.avatarUrl" [alt]="person.name" [title]="person.name" class="w-6 h-6 rounded-full border border-white shadow-sm object-cover" referrerpolicy="no-referrer" />
                            } @else {
                              <div class="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium text-gray-600 border border-white shadow-sm" [title]="person.name">
                                {{ person.name.charAt(0) }}
                              </div>
                            }
                          }
                          <span class="text-xs text-gray-500 ml-1 truncate max-w-[120px]">{{ node.ticket.assignees[0].name }}</span>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>

              @if (selectionRect()) {
                <div
                  class="absolute border-2 border-blue-400 bg-blue-100/20 pointer-events-none"
                  [style.left.px]="selectionRect()!.x"
                  [style.top.px]="selectionRect()!.y"
                  [style.width.px]="selectionRect()!.w"
                  [style.height.px]="selectionRect()!.h"
                ></div>
              }
</div>

            <!-- Status picker popover (outside canvas to avoid event conflicts) -->
            @if (statusPicker()) {
              <div
                class="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-56 max-h-72 overflow-y-auto"
                [style.left.px]="statusPicker()!.x"
                [style.top.px]="statusPicker()!.y"
                (mousedown)="$event.stopPropagation()"
                (click)="$event.stopPropagation()"
              >
                <div class="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-100">Changer le statut</div>
                @for (col of columnDefinitions; track col.key) {
                  <button
                    class="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 flex items-center gap-2"
                    [class.font-semibold]="isCurrentStatus(col.key)"
                    [class.bg-blue-50]="isCurrentStatus(col.key)"
                    (click)="changeStatus(col.key)"
                  >
                    <div class="w-2.5 h-2.5 rounded-full shrink-0" [class]="getLegendDot(col.key)"></div>
                    {{ col.displayName }}
                  </button>
                }
              </div>
            }

            <!-- Context menu (outside canvas too) -->
            @if (contextMenu()) {
              <div
                class="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1"
                [style.left.px]="contextMenu()!.x"
                [style.top.px]="contextMenu()!.y"
                (mousedown)="$event.stopPropagation()"
                (click)="$event.stopPropagation()"
              >
                <button class="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left" (click)="deleteEdge()">
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

  readonly linkSource = signal<{ ticketId: string; side: string } | null>(null);
  readonly mousePos = signal<{ x: number; y: number } | null>(null);
  readonly contextMenu = signal<{ x: number; y: number; edge: GraphEdge } | null>(null);
  readonly statusPicker = signal<{ x: number; y: number; node: GraphNode } | null>(null);
  readonly selectedNodeIds = signal<Set<string>>(new Set());
  readonly selectionRect = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  readonly groups = signal<GraphGroup[]>([]);

  readonly legendItems = LEGEND_ITEMS;
  readonly columnDefinitions = COLUMN_DEFINITIONS;
  readonly groupColors = GROUP_COLORS;

  private isSelecting = false;
  private selStartX = 0;
  private selStartY = 0;
  draggingNode: GraphNode | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private dragMoved = false;
  private dragSelectedOffsets: Map<string, { dx: number; dy: number }> = new Map();

  private draggingGroup: GraphGroup | null = null;
  private groupDragOffsetX = 0;
  private groupDragOffsetY = 0;
  private resizingGroup: GraphGroup | null = null;
  private resizeStartW = 0;
  private resizeStartH = 0;
  private resizeStartMouseX = 0;
  private resizeStartMouseY = 0;

  static readonly NODE_WIDTH = 240;
  static readonly NODE_HEIGHT = 120;

  readonly edgePaths = computed(() => {
    const nodeList = this.nodes();
    const edgeList = this.edges();
    const nodeMap = new Map(nodeList.map(n => [n.ticket.notionId, n]));

    return edgeList
      .map(e => {
        const from = nodeMap.get(e.from);
        const to = nodeMap.get(e.to);
        if (!from || !to) return null;
        return { id: `${e.from}-${e.to}`, path: this.computeEdgePath(from, to), from: e.from, to: e.to };
      })
      .filter((e): e is { id: string; path: string; from: string; to: string } => e !== null);
  });

  readonly pendingEdgePath = computed(() => {
    const source = this.linkSource();
    const mouse = this.mousePos();
    if (!source || !mouse) return null;

    const sourceNode = this.nodes().find(n => n.ticket.notionId === source.ticketId);
    if (!sourceNode) return null;

    const fromX = sourceNode.x + GraphComponent.NODE_WIDTH / 2;
    const fromY = source.side === 'bottom' ? sourceNode.y + GraphComponent.NODE_HEIGHT : sourceNode.y;
    const z = this.zoom();
    const toX = (mouse.x - this.panX()) / z;
    const toY = (mouse.y - this.panY()) / z;
    const dy = Math.abs(toY - fromY);
    const offset = Math.max(60, dy * 0.4);

    return `M ${fromX} ${fromY} C ${fromX} ${fromY + offset}, ${toX} ${toY - offset}, ${toX} ${toY}`;
  });

  constructor() {
    effect(() => {
      const team = this.teamConfigService.selectedTeam();
      const epic = this.teamConfigService.selectedEpic();
      if (team && epic) this.fetchTickets();
    });
  }

  ngAfterViewInit(): void {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.cancelLink();
    this.contextMenu.set(null);
    this.statusPicker.set(null);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.contextMenu.set(null);
    this.statusPicker.set(null);
  }

  getNodeColorClasses(node: GraphNode): string {
    const columnKey = this.teamConfigService.getColumnKeyForStatus(node.ticket.status);
    const colors = getStatusColor(columnKey);
    if (this.linkSource() && this.linkSource()!.ticketId !== node.ticket.notionId) {
      return `${colors.bg} border-green-400`;
    }
    return `${colors.bg} ${colors.border}`;
  }

  getLegendDot(key: ColumnKey): string {
    return LEGEND_ITEMS.find(l => l.key === key)?.dotClass || 'bg-gray-400';
  }

  isCurrentStatus(columnKey: ColumnKey): boolean {
    const picker = this.statusPicker();
    if (!picker) return false;
    const currentKey = this.teamConfigService.getColumnKeyForStatus(picker.node.ticket.status);
    return currentKey === columnKey;
  }

  // --- Status change ---

  changeStatus(columnKey: ColumnKey): void {
    const picker = this.statusPicker();
    if (!picker) return;

    const team = this.teamConfigService.selectedTeam();
    if (!team) return;

    const newStatus = this.teamConfigService.getFirstStatusForColumn(columnKey);
    if (!newStatus) return;

    const ticketId = picker.node.ticket.notionId;
    const previousStatus = picker.node.ticket.status;

    if (newStatus === previousStatus) {
      this.statusPicker.set(null);
      return;
    }

    // Optimistic update
    this.updateTicketStatus(ticketId, newStatus);
    this.statusPicker.set(null);

    this.notionService.updatePageProperty(ticketId, {
      [team.propertiesName.status]: { select: { name: newStatus } },
    }).subscribe({
      error: err => {
        console.error('Failed to update status:', err);
        this.toastService.error('Erreur lors du changement de statut.');
        this.updateTicketStatus(ticketId, previousStatus);
      },
    });
  }

  private updateTicketStatus(ticketId: string, status: string): void {
    this.tickets.update(ts => ts.map(t => t.notionId === ticketId ? { ...t, status } : t));
    this.nodes.update(ns => ns.map(n => n.ticket.notionId === ticketId ? { ...n, ticket: { ...n.ticket, status } } : n));
  }

  // --- Link mode ---

  onDotMouseDown(event: MouseEvent, node: GraphNode, side: string): void {
    event.stopPropagation();
    event.preventDefault();
    this.linkSource.set({ ticketId: node.ticket.notionId, side });
  }

  onDotMouseUp(event: MouseEvent, node: GraphNode): void {
    event.stopPropagation();
    this.completeLink(node.ticket.notionId);
  }

  onNodeClick(event: MouseEvent, node: GraphNode): void {
    event.stopPropagation();

    if (this.linkSource()) {
      this.completeLink(node.ticket.notionId);
      return;
    }

    // If we were dragging, don't open status picker
    if (this.dragMoved) return;

    // Open status picker
    this.statusPicker.set({ x: event.clientX, y: event.clientY, node });
  }

  private completeLink(targetId: string): void {
    const source = this.linkSource();
    if (!source || source.ticketId === targetId) { this.cancelLink(); return; }

    if (this.edges().some(e => e.from === source.ticketId && e.to === targetId)) {
      this.toastService.error('Cette dépendance existe déjà.');
      this.cancelLink();
      return;
    }

    const team = this.teamConfigService.selectedTeam();
    if (!team) return;
    const fromTicket = this.tickets().find(t => t.notionId === source.ticketId);
    if (!fromTicket) return;

    this.edges.update(edges => [...edges, { from: source.ticketId, to: targetId }]);
    this.updateTicketDeps(source.ticketId, deps => [...deps, targetId]);
    this.cancelLink();

    this.notionService.addDependency(source.ticketId, fromTicket.dependencyIds, targetId, team.propertiesName.bloque).subscribe({
      next: () => this.toastService.success('Dépendance créée.'),
      error: err => {
        console.error('Failed to add dependency:', err);
        this.toastService.error('Erreur lors de la création de la dépendance.');
        this.edges.update(edges => edges.filter(e => !(e.from === source.ticketId && e.to === targetId)));
        this.updateTicketDeps(source.ticketId, deps => deps.filter(id => id !== targetId));
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
    this.edges.update(edges => edges.filter(e => !(e.from === from && e.to === to)));
    this.updateTicketDeps(from, deps => deps.filter(id => id !== to));
    this.contextMenu.set(null);

    this.notionService.removeDependency(from, fromTicket.dependencyIds, to, team.propertiesName.bloque).subscribe({
      next: () => this.toastService.success('Dépendance supprimée.'),
      error: err => {
        console.error('Failed to remove dependency:', err);
        this.toastService.error('Erreur lors de la suppression.');
        this.edges.update(edges => [...edges, { from, to }]);
        this.updateTicketDeps(from, deps => [...deps, to]);
      },
    });
  }

  private updateTicketDeps(ticketId: string, updater: (deps: string[]) => string[]): void {
    this.tickets.update(ts => ts.map(t => t.notionId === ticketId ? { ...t, dependencyIds: updater(t.dependencyIds) } : t));
    this.nodes.update(ns => ns.map(n => n.ticket.notionId === ticketId ? { ...n, ticket: { ...n.ticket, dependencyIds: updater(n.ticket.dependencyIds) } } : n));
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
        if (ticketIds.has(depId)) edges.push({ from: ticket.notionId, to: depId });
      }
    }
    this.edges.set(edges);
    let nodes = this.computeLayout(tickets, edges);

    // Try to restore saved positions; only center if no saved layout
    const savedRaw = localStorage.getItem(this.layoutKey);
    if (savedRaw) {
      nodes = this.restoreLayout(nodes);
    } else {
      this.groups.set([]);
    }
    this.nodes.set(nodes);
    if (!savedRaw) {
      this.centerView(nodes);
    }
  }

  /**
   * Layout: parents centered above their children.
   * 1. Assign layers via BFS (roots = layer 0)
   * 2. Position bottom-up: leaf layer first, evenly spaced
   * 3. Each parent is centered at the average x of its children
   */
  private computeLayout(tickets: Ticket[], edges: GraphEdge[]): GraphNode[] {
    if (tickets.length === 0) return [];

    const children = new Map<string, string[]>();
    const parents = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    tickets.forEach(t => {
      children.set(t.notionId, []);
      parents.set(t.notionId, []);
      inDegree.set(t.notionId, 0);
    });
    const ticketIds = new Set(tickets.map(t => t.notionId));
    edges.forEach(e => {
      if (ticketIds.has(e.from) && ticketIds.has(e.to)) {
        children.get(e.from)!.push(e.to);
        parents.get(e.to)!.push(e.from);
        inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
      }
    });

    // BFS to assign layers
    const layers = new Map<string, number>();
    const queue: string[] = [];
    tickets.forEach(t => {
      if ((inDegree.get(t.notionId) || 0) === 0) {
        layers.set(t.notionId, 0);
        queue.push(t.notionId);
      }
    });
    while (queue.length > 0) {
      const id = queue.shift()!;
      const layer = layers.get(id)!;
      for (const childId of children.get(id) || []) {
        const current = layers.get(childId);
        if (current === undefined || current < layer + 1) {
          layers.set(childId, layer + 1);
          queue.push(childId);
        }
      }
    }
    // Unvisited nodes (cycles or isolated)
    tickets.forEach(t => { if (!layers.has(t.notionId)) layers.set(t.notionId, 0); });

    // Group by layer
    const maxLayer = Math.max(...Array.from(layers.values()), 0);
    const layerGroups: string[][] = [];
    for (let i = 0; i <= maxLayer; i++) layerGroups.push([]);
    tickets.forEach(t => layerGroups[layers.get(t.notionId)!].push(t.notionId));

    // Position bottom-up
    const xPos = new Map<string, number>();
    const nodeW = GraphComponent.NODE_WIDTH;
    const colGap = 80;

    // Start from deepest layer
    for (let layer = maxLayer; layer >= 0; layer--) {
      const group = layerGroups[layer];

      group.forEach(id => {
        const childIds = (children.get(id) || []).filter(c => ticketIds.has(c));
        if (childIds.length > 0 && childIds.every(c => xPos.has(c))) {
          // Center above children
          const childXs = childIds.map(c => xPos.get(c)!);
          xPos.set(id, (Math.min(...childXs) + Math.max(...childXs)) / 2);
        }
      });

      // Position nodes that don't have positioned children yet (or have none)
      const unpositioned = group.filter(id => !xPos.has(id));
      const positioned = group.filter(id => xPos.has(id));

      if (unpositioned.length > 0) {
        // Find a starting x that doesn't overlap with positioned nodes
        const takenXs = positioned.map(id => xPos.get(id)!).sort((a, b) => a - b);
        let startX = 0;
        if (takenXs.length > 0) {
          // Place unpositioned nodes after positioned ones
          startX = Math.max(...takenXs) + nodeW + colGap;
        }
        unpositioned.forEach((id, i) => {
          xPos.set(id, startX + i * (nodeW + colGap));
        });
      }

      // Resolve overlaps within the layer
      const sorted = [...group].sort((a, b) => xPos.get(a)! - xPos.get(b)!);
      for (let i = 1; i < sorted.length; i++) {
        const prev = xPos.get(sorted[i - 1])!;
        const curr = xPos.get(sorted[i])!;
        if (curr < prev + nodeW + colGap) {
          xPos.set(sorted[i], prev + nodeW + colGap);
        }
      }
    }

    const rowGap = 200;
    const ticketMap = new Map(tickets.map(t => [t.notionId, t]));
    const nodes: GraphNode[] = [];

    for (const [id, x] of xPos) {
      const ticket = ticketMap.get(id)!;
      const layer = layers.get(id)!;
      nodes.push({ ticket, x, y: layer * rowGap + 100, dragging: false });
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
      const newZoom = Math.min(canvasW / (graphW + 200), canvasH / (graphH + 200), 1);
      this.zoom.set(newZoom);
      this.panX.set((canvasW - graphW * newZoom) / 2 - minX * newZoom);
      this.panY.set((canvasH - graphH * newZoom) / 2 - minY * newZoom);
    }, 50);
  }

  autoLayout(): void {
    const tickets = this.tickets();
    if (tickets.length === 0) return;
    this.nodes.set(this.computeLayout(tickets, this.edges()));
    this.centerView(this.nodes());
    this.saveLayout();
  }

  private computeEdgePath(from: GraphNode, to: GraphNode): string {
    const fromX = from.x + GraphComponent.NODE_WIDTH / 2;
    const fromY = from.y + GraphComponent.NODE_HEIGHT;
    const toX = to.x + GraphComponent.NODE_WIDTH / 2;
    const toY = to.y;
    const dy = Math.abs(toY - fromY);
    const offset = Math.max(60, dy * 0.4);
    return `M ${fromX} ${fromY} C ${fromX} ${fromY + offset}, ${toX} ${toY - offset}, ${toX} ${toY}`;
  }

  // --- Pan & Zoom ---
  // Trackpad: two-finger scroll = pan, pinch (ctrlKey) = zoom
  // Mouse wheel: Ctrl+wheel = zoom, plain wheel = pan vertically

  onWheel(event: WheelEvent): void {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      // Pinch-to-zoom or Ctrl+wheel → zoom (slow factor)
      const factor = 1 - event.deltaY * 0.003;
      const newZoom = Math.max(0.1, Math.min(3, this.zoom() * factor));
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const scale = newZoom / this.zoom();
      this.panX.set(mouseX - scale * (mouseX - this.panX()));
      this.panY.set(mouseY - scale * (mouseY - this.panY()));
      this.zoom.set(newZoom);
    } else {
      // Two-finger scroll / trackpad → pan
      this.panX.update(v => v - event.deltaX);
      this.panY.update(v => v - event.deltaY);
    }
  }

  onCanvasMouseDown(event: MouseEvent): void {
    this.statusPicker.set(null);
    if (this.linkSource()) { this.cancelLink(); return; }
    if (this.draggingNode) return;

    // Middle mouse button → no action (browser default)
    if (event.button === 1) return;

    // Left click on canvas → start selection rectangle
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.isSelecting = true;
    this.selStartX = event.clientX - rect.left;
    this.selStartY = event.clientY - rect.top;
    this.selectionRect.set(null);

    // Clear selection unless Shift is held
    if (!event.shiftKey) {
      this.selectedNodeIds.set(new Set());
    }
  }

  onCanvasMouseMove(event: MouseEvent): void {
    if (this.linkSource()) {
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      this.mousePos.set({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    }

    if (this.resizingGroup) {
      const z = this.zoom();
      const dx = (event.clientX - this.resizeStartMouseX) / z;
      const dy = (event.clientY - this.resizeStartMouseY) / z;
      const gId = this.resizingGroup.id;
      this.groups.update(gs => gs.map(g => g.id === gId ? { ...g, w: Math.max(100, this.resizeStartW + dx), h: Math.max(60, this.resizeStartH + dy) } : g));
      return;
    }

    if (this.draggingGroup) {
      const z = this.zoom();
      const gId = this.draggingGroup.id;
      const newX = (event.clientX - this.panX()) / z - this.groupDragOffsetX;
      const newY = (event.clientY - this.panY()) / z - this.groupDragOffsetY;
      this.groups.update(gs => gs.map(g => g.id === gId ? { ...g, x: newX, y: newY } : g));
      return;
    }

    if (this.draggingNode) {
      this.dragMoved = true;
      const z = this.zoom();
      const nodeId = this.draggingNode.ticket.notionId;
      const newX = (event.clientX - this.panX()) / z - this.dragOffsetX;
      const newY = (event.clientY - this.panY()) / z - this.dragOffsetY;

      // Move all selected nodes together
      if (this.selectedNodeIds().has(nodeId) && this.dragSelectedOffsets.size > 0) {
        this.nodes.update(nodes =>
          nodes.map(n => {
            const offset = this.dragSelectedOffsets.get(n.ticket.notionId);
            if (offset) {
              return { ...n, x: newX + offset.dx, y: newY + offset.dy };
            }
            return n;
          })
        );
      } else {
        this.nodes.update(nodes =>
          nodes.map(n => n.ticket.notionId === nodeId
            ? { ...n, x: newX, y: newY }
            : n
          )
        );
      }
    } else if (this.isSelecting) {
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      const curX = event.clientX - rect.left;
      const curY = event.clientY - rect.top;
      const x = Math.min(this.selStartX, curX);
      const y = Math.min(this.selStartY, curY);
      const w = Math.abs(curX - this.selStartX);
      const h = Math.abs(curY - this.selStartY);
      this.selectionRect.set({ x, y, w, h });

      // Find nodes inside selection rectangle (convert screen coords → graph coords)
      if (w > 5 || h > 5) {
        const z = this.zoom();
        const graphX1 = (x - this.panX()) / z;
        const graphY1 = (y - this.panY()) / z;
        const graphX2 = (x + w - this.panX()) / z;
        const graphY2 = (y + h - this.panY()) / z;

        const selected = new Set<string>();
        for (const node of this.nodes()) {
          const nx = node.x;
          const ny = node.y;
          const nw = GraphComponent.NODE_WIDTH;
          const nh = GraphComponent.NODE_HEIGHT;
          // Node intersects selection rect
          if (nx + nw > graphX1 && nx < graphX2 && ny + nh > graphY1 && ny < graphY2) {
            selected.add(node.ticket.notionId);
          }
        }
        this.selectedNodeIds.set(selected);
      }
    }
  }

  onCanvasMouseUp(event?: MouseEvent): void {
    if (this.draggingNode) {
      this.nodes.update(nodes => nodes.map(n => n.ticket.notionId === this.draggingNode!.ticket.notionId ? { ...n, dragging: false } : n));
      this.draggingNode = null;
      this.dragSelectedOffsets.clear();
      this.saveLayout();
    }
    if (this.draggingGroup || this.resizingGroup) {
      this.draggingGroup = null;
      this.resizingGroup = null;
      this.saveLayout();
    }
    this.isSelecting = false;
    this.selectionRect.set(null);
  }

  onNodeMouseDown(event: MouseEvent, node: GraphNode): void {
    if (this.linkSource()) return;
    event.stopPropagation();
    this.statusPicker.set(null);
    this.dragMoved = false;
    const z = this.zoom();
    this.dragOffsetX = (event.clientX - this.panX()) / z - node.x;
    this.dragOffsetY = (event.clientY - this.panY()) / z - node.y;
    this.draggingNode = node;
    this.nodes.update(nodes => nodes.map(n => n.ticket.notionId === node.ticket.notionId ? { ...n, dragging: true } : n));

    // If this node is in the selection, compute offsets for all selected nodes
    if (this.selectedNodeIds().has(node.ticket.notionId)) {
      this.dragSelectedOffsets.clear();
      for (const n of this.nodes()) {
        if (this.selectedNodeIds().has(n.ticket.notionId)) {
          this.dragSelectedOffsets.set(n.ticket.notionId, {
            dx: n.x - node.x,
            dy: n.y - node.y,
          });
        }
      }
    } else {
      // Clicking a non-selected node clears selection
      this.selectedNodeIds.set(new Set());
      this.dragSelectedOffsets.clear();
    }
  }

  // --- Groups ---

  addGroup(): void {
    const z = this.zoom();
    const canvas = this.canvasRef?.nativeElement;
    const cx = canvas ? canvas.clientWidth / 2 : 400;
    const cy = canvas ? canvas.clientHeight / 2 : 300;
    const graphX = (cx - this.panX()) / z;
    const graphY = (cy - this.panY()) / z;

    const group: GraphGroup = {
      id: crypto.randomUUID(),
      label: 'Nouveau groupe',
      x: graphX - 200,
      y: graphY - 100,
      w: 400,
      h: 250,
      color: GROUP_COLORS[this.groups().length % GROUP_COLORS.length].hex,
    };
    this.groups.update(gs => [...gs, group]);
    this.saveLayout();
  }

  removeGroup(id: string): void {
    this.groups.update(gs => gs.filter(g => g.id !== id));
    this.saveLayout();
  }

  setGroupColor(group: GraphGroup, hex: string): void {
    this.groups.update(gs => gs.map(g => g.id === group.id ? { ...g, color: hex } : g));
    this.saveLayout();
  }

  onGroupLabelChange(group: GraphGroup, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.groups.update(gs => gs.map(g => g.id === group.id ? { ...g, label: value } : g));
    this.saveLayout();
  }

  onGroupMouseDown(event: MouseEvent, group: GraphGroup): void {
    event.stopPropagation();
    const z = this.zoom();
    this.draggingGroup = group;
    this.groupDragOffsetX = (event.clientX - this.panX()) / z - group.x;
    this.groupDragOffsetY = (event.clientY - this.panY()) / z - group.y;
  }

  onGroupResizeMouseDown(event: MouseEvent, group: GraphGroup): void {
    event.stopPropagation();
    this.resizingGroup = group;
    this.resizeStartW = group.w;
    this.resizeStartH = group.h;
    this.resizeStartMouseX = event.clientX;
    this.resizeStartMouseY = event.clientY;
  }

  // --- Persistence (localStorage) ---

  private get layoutKey(): string {
    const team = this.teamConfigService.selectedTeam();
    const epic = this.teamConfigService.selectedEpic();
    return `graph_layout_${team?.id}_${epic?.id}`;
  }

  saveLayout(): void {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of this.nodes()) {
      positions[n.ticket.notionId] = { x: n.x, y: n.y };
    }
    const data = {
      positions,
      groups: this.groups(),
      zoom: this.zoom(),
      panX: this.panX(),
      panY: this.panY(),
    };
    try { localStorage.setItem(this.layoutKey, JSON.stringify(data)); } catch {}
  }

  private restoreLayout(nodes: GraphNode[]): GraphNode[] {
    try {
      const raw = localStorage.getItem(this.layoutKey);
      if (!raw) return nodes;
      const data = JSON.parse(raw);

      if (data.groups) this.groups.set(data.groups);
      if (data.zoom) this.zoom.set(data.zoom);
      if (data.panX !== undefined) this.panX.set(data.panX);
      if (data.panY !== undefined) this.panY.set(data.panY);

      if (data.positions) {
        return nodes.map(n => {
          const pos = data.positions[n.ticket.notionId];
          return pos ? { ...n, x: pos.x, y: pos.y } : n;
        });
      }
    } catch {}
    return nodes;
  }
}

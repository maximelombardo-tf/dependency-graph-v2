import {
  Component,
  inject,
  signal,
  computed,
  effect,
  untracked,
  ElementRef,
  ViewChild,
  AfterViewInit,
  HostListener,
  ChangeDetectionStrategy,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { toPng } from 'html-to-image';
import { SelectorComponent } from '../selector/selector.component';
import { AuthService } from '../../core/services/auth.service';
import { TeamConfigService } from '../../core/services/team-config.service';
import { NotionService } from '../../core/services/notion.service';
import { ToastService } from '../../shared/components/toast.service';
import { Ticket, Assignee } from '../../core/models/ticket.model';
import { Dependency } from '../../core/models/dependency.model';
import { COLUMN_DEFINITIONS, ColumnKey } from '../../core/models/team-config.model';
import { getStatusColor, LEGEND_ITEMS } from '../../core/utils/status-colors';
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

type AnnotationType = 'star' | 'hourglass' | 'checkbox' | 'flag' | 'warning';

interface CanvasAnnotation {
  id: string;
  type: AnnotationType;
  x: number;
  y: number;
}

interface LayoutData {
  positions: Record<string, { x: number; y: number }>;
  groups: GraphGroup[];
  annotations: CanvasAnnotation[];
  zoom: number;
  panX: number;
  panY: number;
}

interface AnnotationSvg {
  color: string;
  paths: { d: string; fill?: string; stroke?: string; strokeWidth?: number }[];
  viewBox?: string;
}

const ANNOTATION_SVGS: Record<AnnotationType, AnnotationSvg> = {
  star: {
    color: '#F59E0B',
    paths: [{ d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z', fill: '#F59E0B', stroke: '#D97706', strokeWidth: 1 }],
  },
  hourglass: {
    color: '#3B82F6',
    paths: [
      { d: 'M5 22h14M5 2h14', fill: 'none', stroke: '#3B82F6', strokeWidth: 2 },
      { d: 'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 1 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2', fill: '#BFDBFE', stroke: '#3B82F6', strokeWidth: 1.5 },
    ],
  },
  checkbox: {
    color: '#22C55E',
    paths: [
      { d: 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', fill: '#DCFCE7', stroke: '#22C55E', strokeWidth: 1.5 },
    ],
  },
  flag: {
    color: '#EF4444',
    paths: [
      { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', fill: '#FEE2E2', stroke: '#EF4444', strokeWidth: 1.5 },
      { d: 'M4 22V15', fill: 'none', stroke: '#EF4444', strokeWidth: 2 },
    ],
  },
  warning: {
    color: '#F97316',
    paths: [
      { d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', fill: '#FFEDD5', stroke: '#F97316', strokeWidth: 1.5 },
      { d: 'M12 9v4', fill: 'none', stroke: '#F97316', strokeWidth: 2 },
      { d: 'M12 17h.01', fill: 'none', stroke: '#F97316', strokeWidth: 2 },
    ],
  },
};

const ANNOTATION_TYPES: AnnotationType[] = ['star', 'hourglass', 'checkbox', 'flag', 'warning'];

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

// getStatusColor and LEGEND_ITEMS imported from core/utils/status-colors

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
            <a [routerLink]="getNavLink('board')" class="px-3 py-1 text-sm rounded-md text-gray-600 hover:bg-white transition-colors">Kanban</a>
          </nav>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-400">
            @if (linkSource()) {
              Cliquez sur un ticket cible (ESC pour annuler)
            } @else {
              Points: lier / Clic: assigner / Clic droit flèche: supprimer
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
          <div class="flex items-center gap-0.5 border-l border-gray-200 pl-2">
            @for (type of annotationTypes; track type) {
              <button
                class="w-7 h-7 flex items-center justify-center rounded transition-colors"
                [class]="addAnnotationMode() === type ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-gray-100'"
                [title]="'Ajouter ' + type"
                (click)="toggleAnnotationMode(type)"
              >
                <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                  @for (p of annotationSvgs[type].paths; track $index) {
                    <path
                      [attr.d]="p.d"
                      [attr.fill]="p.fill ?? 'none'"
                      [attr.stroke]="p.stroke ?? 'none'"
                      [attr.stroke-width]="p.strokeWidth ?? 0"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  }
                </svg>
              </button>
            }
          </div>
          <button
            class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            (click)="autoLayout()"
            title="Auto-layout"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            class="p-1.5 rounded-md transition-colors"
            [class]="timelineMode() ? 'text-blue-600 bg-blue-100' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
            (click)="toggleTimeline()"
            [title]="timelineMode() ? 'Vue dépendances' : 'Vue groupée'"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          @if (timelineMode()) {
            <div class="flex items-center gap-2 border-l border-gray-200 pl-3">
              <span class="text-xs text-gray-500">Grouper par</span>
              <select
                class="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                [value]="timelineGroupBy()"
                (change)="onTimelineGroupByChange($event)"
              >
                @for (opt of timelineGroupByOptions(); track opt.value) {
                  <option [value]="opt.value">{{ opt.label }}</option>
                }
              </select>
              <span class="text-xs text-gray-500">Trier par</span>
              <select
                class="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                [value]="timelineSortBy()"
                (change)="onTimelineSortByChange($event)"
              >
                @for (opt of timelineSortByOptions(); track opt.value) {
                  <option [value]="opt.value">{{ opt.label }}</option>
                }
              </select>
            </div>
          }
          <button
            class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            (click)="takeScreenshot()"
            title="Télécharger un screenshot"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
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

              @if (teamConfigService.selectedEpics().length > 1) {
                <div class="border-t border-gray-200 mt-2.5 pt-2.5">
                  <div class="text-xs font-semibold text-gray-500 mb-2">Epic</div>
                  <div class="flex flex-col gap-1.5">
                    @for (epic of teamConfigService.selectedEpics(); track epic.id) {
                      <div
                        class="flex items-center gap-2 cursor-pointer rounded px-1 -mx-1 transition-colors"
                        [class.bg-gray-200]="highlightedEpicId() === epic.id"
                        [title]="epic.title"
                        (click)="toggleEpicHighlight(epic.id); $event.stopPropagation()"
                      >
                        <div class="w-2.5 h-2.5 rounded-sm shrink-0" [style.background-color]="teamConfigService.epicColorMap().get(epic.id)"></div>
                        <span class="text-xs text-gray-600 whitespace-nowrap max-w-[150px] truncate">{{ epic.title }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>

            <!-- Canvas -->
            <div
              #canvas
              class="absolute inset-0 overflow-hidden bg-gray-50"
              [class.cursor-crosshair]="!!linkSource() || !!addAnnotationMode()"
              [class.cursor-default]="!linkSource() && !addAnnotationMode()"
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
                <!-- Timeline column labels -->
                @if (timelineMode()) {
                  @for (col of timelineColumns(); track col.label) {
                    <div
                      class="absolute flex flex-col items-center select-none"
                      [style.left.px]="col.x"
                      [style.top.px]="30"
                      [style.width.px]="280"
                    >
                      <span class="text-sm font-semibold text-gray-500">{{ col.label }}</span>
                      @if (col.points > 0) {
                        <span class="text-xs text-gray-400 mt-0.5">{{ col.points }} pts</span>
                      }
                      <div class="w-px bg-gray-200 absolute top-6" style="height: 5000px;"></div>
                    </div>
                  }
                }

                <!-- Group rectangles -->
                @for (group of groups(); track group.id) {
                  <div
                    class="absolute rounded-xl border-2 select-none group/grp"
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
                    <div class="absolute -top-7 right-0 flex items-center gap-1 opacity-0 group-hover/grp:opacity-100 transition-opacity" style="pointer-events: auto;" (mousedown)="$event.stopPropagation()">
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

                <!-- Canvas annotations -->
                @for (annotation of annotations(); track annotation.id) {
                  <div
                    class="absolute select-none cursor-grab active:cursor-grabbing"
                    [style.left.px]="annotation.x"
                    [style.top.px]="annotation.y"
                    [style.z-index]="60"
                    style="width: 64px; height: 64px;"
                    title="Clic droit pour supprimer"
                    (mousedown)="onAnnotationMouseDown($event, annotation)"
                    (contextmenu)="onAnnotationRightClick($event, annotation)"
                  >
                    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));">
                      @for (p of annotationSvgs[annotation.type].paths; track $index) {
                        <path
                          [attr.d]="p.d"
                          [attr.fill]="p.fill ?? 'none'"
                          [attr.stroke]="p.stroke ?? 'none'"
                          [attr.stroke-width]="p.strokeWidth ?? 0"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      }
                    </svg>
                  </div>
                }

                <!-- Ticket nodes -->
                @for (node of nodes(); track node.ticket.notionId) {
                  <div
                    class="absolute select-none group transition-opacity"
                    [style.left.px]="node.x"
                    [style.top.px]="node.y"
                    [style.z-index]="node.dragging ? 50 : 10"
                    [style.opacity]="isNodeDimmed(node.ticket) ? 0.2 : 1"
                    (mousedown)="onNodeMouseDown($event, node)"
                    (contextmenu)="onNodeRightClick($event, node)"
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
                      @if (teamConfigService.selectedEpics().length > 1 && getEpicColor(node.ticket)) {
                        <div class="flex items-center gap-1.5 mb-1.5">
                          <div class="w-2 h-2 rounded-sm shrink-0" [style.background-color]="getEpicColor(node.ticket)"></div>
                          <span class="text-[10px] text-gray-400 truncate">{{ getEpicName(node.ticket) }}</span>
                        </div>
                      }

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

                      @for (field of teamConfigService.extraDisplayFields(); track field) {
                        @if (node.ticket.extraFields[field]) {
                          <div class="mt-1 flex items-center gap-1">
                            <span class="text-xs text-gray-400">{{ field }}:</span>
                            <span class="text-xs text-gray-600 truncate">{{ formatFieldValue(node.ticket.extraFields[field]) }}</span>
                          </div>
                        }
                      }
                    </div>
                  </div>
                }

                <!-- SVG edges (rendered after nodes so arrows appear on top) -->
                <svg class="absolute top-0 left-0 pointer-events-none" [attr.width]="svgSize()" [attr.height]="svgSize()" style="overflow: visible; z-index: 15;">
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

            <!-- Assignee picker popover -->
            @if (assigneePicker()) {
              <div
                class="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-56 max-h-72 overflow-y-auto"
                [style.left.px]="assigneePicker()!.x"
                [style.top.px]="assigneePicker()!.y"
                (mousedown)="$event.stopPropagation()"
                (click)="$event.stopPropagation()"
              >
                <div class="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-100">Assigner</div>
                <button
                  class="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-red-500"
                  (click)="selectAssignee(null)"
                >
                  Retirer l'assignation
                </button>
                @for (person of allAssignees(); track person.id) {
                  <button
                    class="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 flex items-center gap-2"
                    (click)="selectAssignee(person)"
                  >
                    @if (person.avatarUrl) {
                      <img [src]="person.avatarUrl" [alt]="person.name" class="w-5 h-5 rounded-full object-cover" referrerpolicy="no-referrer" />
                    } @else {
                      <div class="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium text-gray-600">
                        {{ person.name.charAt(0) }}
                      </div>
                    }
                    {{ person.name }}
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

            <!-- Node context menu -->
            @if (nodeContextMenu()) {
              <div
                class="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1"
                [style.left.px]="nodeContextMenu()!.x"
                [style.top.px]="nodeContextMenu()!.y"
                (mousedown)="$event.stopPropagation()"
                (click)="$event.stopPropagation()"
              >
                <button class="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left" (click)="requestDeleteTicket()">
                  Supprimer le ticket
                </button>
              </div>
            }

            <!-- Delete ticket confirmation dialog -->
            @if (deleteConfirm()) {
              <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30" (click)="cancelDeleteTicket()">
                <div class="bg-white rounded-xl shadow-2xl p-6 w-80 max-w-full" (click)="$event.stopPropagation()">
                  <p class="text-sm font-semibold text-gray-800 mb-1">Supprimer ce ticket ?</p>
                  <p class="text-xs text-gray-500 mb-4">
                    <span class="font-mono">{{ deleteConfirm()!.ticket.id }}</span> — {{ deleteConfirm()!.ticket.title }}
                  </p>
                  <p class="text-xs text-gray-400 mb-5">Le ticket sera archivé dans Notion. Cette action est réversible depuis Notion.</p>
                  <div class="flex gap-2 justify-end">
                    <button class="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50" (click)="cancelDeleteTicket()">Annuler</button>
                    <button class="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700" (click)="confirmDeleteTicket()">Supprimer</button>
                  </div>
                </div>
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
  private readonly http = inject(HttpClient);

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
  readonly nodeContextMenu = signal<{ x: number; y: number; node: GraphNode } | null>(null);
  readonly deleteConfirm = signal<GraphNode | null>(null);
  readonly assigneePicker = signal<{ x: number; y: number; node: GraphNode } | null>(null);

  readonly allAssignees = computed<Assignee[]>(() => {
    const seen = new Map<string, Assignee>();
    for (const ticket of this.tickets()) {
      for (const a of ticket.assignees) {
        if (!seen.has(a.id)) seen.set(a.id, a);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  });
  readonly selectedNodeIds = signal<Set<string>>(new Set());
  readonly selectionRect = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  readonly groups = signal<GraphGroup[]>([]);
  readonly annotations = signal<CanvasAnnotation[]>([]);
  readonly addAnnotationMode = signal<AnnotationType | null>(null);
  readonly annotationTypes = ANNOTATION_TYPES;
  readonly annotationSvgs = ANNOTATION_SVGS;
  readonly highlightedEpicId = signal<string | null>(null);
  readonly timelineMode = signal(false);
  readonly timelineColumns = signal<{ label: string; x: number; points: number }[]>([]);
  readonly timelineGroupBy = signal<string>('__auto__');
  readonly timelineSortBy = signal<string>('__none__');

  readonly timelineGroupByOptions = computed<{ value: string; label: string }[]>(() => {
    const opts: { value: string; label: string }[] = [
      { value: '__auto__', label: 'Date (auto)' },
      { value: 'status', label: 'Statut' },
      { value: 'assignee', label: 'Assigné' },
      { value: 'complexity', label: 'Complexité' },
    ];
    for (const field of this.teamConfigService.availableExtraFields()) {
      if (!['status', 'assignee', 'complexity'].includes(field)) {
        opts.push({ value: field, label: field });
      }
    }
    return opts;
  });

  readonly timelineSortByOptions = computed<{ value: string; label: string }[]>(() => {
    const opts: { value: string; label: string }[] = [
      { value: '__none__', label: 'Aucun tri' },
      { value: 'title', label: 'Titre' },
      { value: 'status', label: 'Statut' },
      { value: 'assignee', label: 'Assigné' },
      { value: 'complexity', label: 'Complexité' },
    ];
    for (const field of this.teamConfigService.availableExtraFields()) {
      if (!['title', 'status', 'assignee', 'complexity'].includes(field)) {
        opts.push({ value: field, label: field });
      }
    }
    return opts;
  });

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

  private draggingAnnotation: CanvasAnnotation | null = null;
  private annotationDragOffsetX = 0;
  private annotationDragOffsetY = 0;

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
      const epics = this.teamConfigService.selectedEpics();
      if (team && epics.length > 0) untracked(() => this.fetchTickets());
    });
  }

  ngAfterViewInit(): void {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.addAnnotationMode.set(null);
    this.nodeContextMenu.set(null);
    this.deleteConfirm.set(null);
    this.cancelLink();
    this.contextMenu.set(null);
    this.assigneePicker.set(null);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.contextMenu.set(null);
    this.nodeContextMenu.set(null);
    this.assigneePicker.set(null);
  }

  toggleEpicHighlight(epicId: string): void {
    this.highlightedEpicId.update(current => current === epicId ? null : epicId);
  }

  isNodeDimmed(ticket: Ticket): boolean {
    const hl = this.highlightedEpicId();
    if (!hl) return false;
    return !ticket.epicIds.includes(hl);
  }

  private static dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

  formatFieldValue(value: string): string {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) return GraphComponent.dateFormatter.format(date);
    }
    return value;
  }

  getNavLink(target: string): string {
    const team = this.teamConfigService.selectedTeam();
    return team ? `/${target}/${TeamConfigService.slugify(team.name)}` : `/${target}`;
  }

  getEpicColor(ticket: Ticket): string | null {
    const colorMap = this.teamConfigService.epicColorMap();
    for (const epicId of ticket.epicIds) {
      const color = colorMap.get(epicId);
      if (color) return color;
    }
    return null;
  }

  getEpicName(ticket: Ticket): string {
    const epics = this.teamConfigService.selectedEpics();
    for (const epicId of ticket.epicIds) {
      const epic = epics.find(e => e.id === epicId);
      if (epic) return epic.title;
    }
    return '';
  }

  getNodeColorClasses(node: GraphNode): string {
    const columnKey = this.teamConfigService.getColumnKeyForStatus(node.ticket.status);
    const colors = getStatusColor(columnKey);
    if (this.linkSource() && this.linkSource()!.ticketId !== node.ticket.notionId) {
      return `${colors.bg} border-green-400`;
    }
    return `${colors.bg} ${colors.border}`;
  }

  // --- Assignee picker ---

  selectAssignee(assignee: Assignee | null): void {
    const picker = this.assigneePicker();
    if (!picker) return;

    const team = this.teamConfigService.selectedTeam();
    if (!team) return;

    const ticketId = picker.node.ticket.notionId;
    const previousAssignees = picker.node.ticket.assignees;
    const previousAssignee = picker.node.ticket.assignee;

    const newAssignees = assignee ? [assignee] : [];
    const newAssignee = assignee ? assignee.name : null;
    this.updateTicketAssignee(ticketId, newAssignee, newAssignees);
    this.assigneePicker.set(null);

    this.notionService.updatePageProperty(ticketId, {
      [team.propertiesName.assignedTo]: { people: assignee ? [{ id: assignee.id }] : [] },
    }).subscribe({
      error: err => {
        console.error('Failed to update assignee:', err);
        this.toastService.error("Erreur lors du changement d'assignation.");
        this.updateTicketAssignee(ticketId, previousAssignee, previousAssignees);
      },
    });
  }

  private updateTicketAssignee(ticketId: string, assignee: string | null, assignees: Assignee[]): void {
    this.tickets.update(ts => ts.map(t => t.notionId === ticketId ? { ...t, assignee, assignees } : t));
    this.nodes.update(ns => ns.map(n => n.ticket.notionId === ticketId ? { ...n, ticket: { ...n.ticket, assignee, assignees } } : n));
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
    this.assigneePicker.set({ x: event.clientX, y: event.clientY, node });
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

  // --- Delete node (archive ticket in Notion) ---

  onNodeRightClick(event: MouseEvent, node: GraphNode): void {
    event.preventDefault();
    event.stopPropagation();
    this.nodeContextMenu.set({ x: event.clientX, y: event.clientY, node });
  }

  requestDeleteTicket(): void {
    const menu = this.nodeContextMenu();
    if (!menu) return;
    this.deleteConfirm.set(menu.node);
    this.nodeContextMenu.set(null);
  }

  confirmDeleteTicket(): void {
    const node = this.deleteConfirm();
    if (!node) return;
    this.deleteConfirm.set(null);

    const notionId = node.ticket.notionId;
    this.tickets.update(ts => ts.filter(t => t.notionId !== notionId));
    this.nodes.update(ns => ns.filter(n => n.ticket.notionId !== notionId));
    this.edges.update(es => es.filter(e => e.from !== notionId && e.to !== notionId));

    this.notionService.archivePage(notionId).subscribe({
      next: () => this.toastService.success('Ticket supprimé.'),
      error: err => {
        console.error('Failed to archive ticket:', err);
        this.toastService.error('Erreur lors de la suppression du ticket.');
        this.fetchTickets();
      },
    });
  }

  cancelDeleteTicket(): void {
    this.deleteConfirm.set(null);
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
    const epics = this.teamConfigService.selectedEpics();
    if (!team || epics.length === 0) return;

    this.loading.set(true);
    this.notionService.getTicketsForEpics(team, epics.map(e => e.id)).subscribe({
      next: async tickets => {
        this.tickets.set(tickets);
        this.updateAvailableFields(tickets);
        await this.buildGraph(tickets);
        this.loading.set(false);
      },
      error: err => {
        console.error('Failed to fetch tickets:', err);
        this.toastService.error('Impossible de charger les tickets.');
        this.loading.set(false);
      },
    });
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

  private async buildGraph(tickets: Ticket[]): Promise<void> {
    const ticketIds = new Set(tickets.map(t => t.notionId));
    const edges: GraphEdge[] = [];
    for (const ticket of tickets) {
      for (const depId of ticket.dependencyIds) {
        if (ticketIds.has(depId)) edges.push({ from: ticket.notionId, to: depId });
      }
    }
    this.edges.set(edges);

    if (this.timelineMode()) {
      const nodes = this.computeTimelineLayout(tickets);
      this.nodes.set(nodes);
      this.centerView(nodes);
      return;
    }

    let nodes = this.computeLayout(tickets, edges);

    const savedData = await this.fetchLayout();
    if (savedData) {
      nodes = this.applyLayout(nodes, savedData);
      nodes = this.resolveOverlaps(nodes);
    } else {
      this.groups.set([]);
      this.annotations.set([]);
    }
    this.nodes.set(nodes);
    if (!savedData) {
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

    // Barycenter heuristic to minimize edge crossings
    const nodeW = GraphComponent.NODE_WIDTH;
    const colGap = 80;

    for (let iter = 0; iter < 4; iter++) {
      // Top-down sweep
      for (let i = 1; i <= maxLayer; i++) {
        const prevOrder = layerGroups[i - 1];
        const posMap = new Map<string, number>();
        prevOrder.forEach((id, idx) => posMap.set(id, idx));

        layerGroups[i].sort((a, b) => {
          const parentsA = (parents.get(a) || []).filter(p => posMap.has(p));
          const parentsB = (parents.get(b) || []).filter(p => posMap.has(p));
          const baryA = parentsA.length > 0
            ? parentsA.reduce((sum, p) => sum + posMap.get(p)!, 0) / parentsA.length
            : Infinity;
          const baryB = parentsB.length > 0
            ? parentsB.reduce((sum, p) => sum + posMap.get(p)!, 0) / parentsB.length
            : Infinity;
          return baryA - baryB;
        });
      }

      // Bottom-up sweep
      for (let i = maxLayer - 1; i >= 0; i--) {
        const nextOrder = layerGroups[i + 1];
        const posMap = new Map<string, number>();
        nextOrder.forEach((id, idx) => posMap.set(id, idx));

        layerGroups[i].sort((a, b) => {
          const childrenA = (children.get(a) || []).filter(c => posMap.has(c));
          const childrenB = (children.get(b) || []).filter(c => posMap.has(c));
          const baryA = childrenA.length > 0
            ? childrenA.reduce((sum, c) => sum + posMap.get(c)!, 0) / childrenA.length
            : Infinity;
          const baryB = childrenB.length > 0
            ? childrenB.reduce((sum, c) => sum + posMap.get(c)!, 0) / childrenB.length
            : Infinity;
          return baryA - baryB;
        });
      }
    }

    // Phase A: sequential grid positions respecting barycenter order
    const xPos = new Map<string, number>();
    for (let layer = 0; layer <= maxLayer; layer++) {
      layerGroups[layer].forEach((id, idx) => {
        xPos.set(id, idx * (nodeW + colGap));
      });
    }

    // Phase B: refine — shift toward connected nodes (2 passes)
    const enforceSpacing = (group: string[]) => {
      const sorted = [...group].sort((a, b) => xPos.get(a)! - xPos.get(b)!);
      for (let i = 1; i < sorted.length; i++) {
        const prev = xPos.get(sorted[i - 1])!;
        const curr = xPos.get(sorted[i])!;
        if (curr < prev + nodeW + colGap) {
          xPos.set(sorted[i], prev + nodeW + colGap);
        }
      }
    };

    for (let pass = 0; pass < 2; pass++) {
      // Bottom-up: center above children
      for (let layer = maxLayer - 1; layer >= 0; layer--) {
        for (const id of layerGroups[layer]) {
          const childIds = (children.get(id) || []).filter(c => xPos.has(c));
          if (childIds.length > 0) {
            const avg = childIds.reduce((s, c) => s + xPos.get(c)!, 0) / childIds.length;
            xPos.set(id, avg);
          }
        }
        enforceSpacing(layerGroups[layer]);
      }

      // Top-down: shift toward parents
      for (let layer = 1; layer <= maxLayer; layer++) {
        for (const id of layerGroups[layer]) {
          const parentIds = (parents.get(id) || []).filter(p => xPos.has(p));
          if (parentIds.length > 0) {
            const avg = parentIds.reduce((s, p) => s + xPos.get(p)!, 0) / parentIds.length;
            xPos.set(id, avg);
          }
        }
        enforceSpacing(layerGroups[layer]);
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
    if (this.timelineMode()) {
      this.nodes.set(this.computeTimelineLayout(tickets));
    } else {
      this.nodes.set(this.computeLayout(tickets, this.edges()));
    }
    this.centerView(this.nodes());
    this.saveLayout();
  }

  async takeScreenshot(): Promise<void> {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    try {
      const dataUrl = await toPng(canvas, { pixelRatio: 2, skipFonts: true });
      const link = document.createElement('a');
      const team = this.teamConfigService.selectedTeam();
      const date = new Date().toISOString().slice(0, 10);
      link.download = `graph-${team?.name ?? 'export'}-${date}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Screenshot failed:', err);
      this.toastService.error('Impossible de générer le screenshot.');
    }
  }

  toggleTimeline(): void {
    this.timelineMode.update(v => !v);
    const tickets = this.tickets();
    if (tickets.length > 0) void this.buildGraph(tickets);
  }

  onTimelineGroupByChange(event: Event): void {
    this.timelineGroupBy.set((event.target as HTMLSelectElement).value);
    const tickets = this.tickets();
    if (tickets.length > 0) void this.buildGraph(tickets);
  }

  onTimelineSortByChange(event: Event): void {
    this.timelineSortBy.set((event.target as HTMLSelectElement).value);
    const tickets = this.tickets();
    if (tickets.length > 0) void this.buildGraph(tickets);
  }

  private getAutoDateField(): string | null {
    const displayFields = this.teamConfigService.extraDisplayFields();
    const available = this.teamConfigService.availableExtraFields();
    for (const field of displayFields) {
      const sample = this.tickets().find(t => /^\d{4}-\d{2}-\d{2}/.test(t.extraFields[field] || ''));
      if (sample) return field;
    }
    for (const field of available) {
      if (field.toLowerCase().includes('date')) {
        const sample = this.tickets().find(t => /^\d{4}-\d{2}-\d{2}/.test(t.extraFields[field] || ''));
        if (sample) return field;
      }
    }
    return null;
  }

  private getTicketGroupValue(ticket: Ticket, groupBy: string): string {
    if (groupBy === '__auto__') {
      const dateField = this.getAutoDateField();
      const rawDate = dateField ? (ticket.extraFields[dateField] || '') : '';
      return /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.substring(0, 10) : '__none__';
    }
    if (groupBy === 'status') return ticket.status || '__none__';
    if (groupBy === 'assignee') return ticket.assignees.map(a => a.name).join(', ') || '__none__';
    if (groupBy === 'complexity') return ticket.complexity || '__none__';
    return ticket.extraFields[groupBy] || '__none__';
  }

  private formatGroupLabel(key: string, groupBy: string): string {
    if (key === '__none__') return groupBy === '__auto__' ? 'Sans date' : 'Non défini';
    if (groupBy === '__auto__') {
      const formatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
      return formatter.format(new Date(key));
    }
    return key;
  }

  private getTicketSortValue(ticket: Ticket, sortBy: string): string {
    if (sortBy === 'title') return ticket.title;
    if (sortBy === 'status') return ticket.status || '';
    if (sortBy === 'assignee') return ticket.assignees.map(a => a.name).join(', ');
    if (sortBy === 'complexity') return ticket.complexity || '';
    return ticket.extraFields[sortBy] || '';
  }

  private computeTimelineLayout(tickets: Ticket[]): GraphNode[] {
    if (tickets.length === 0) { this.timelineColumns.set([]); return []; }

    const groupBy = this.timelineGroupBy();
    const sortBy = this.timelineSortBy();
    const nodeW = GraphComponent.NODE_WIDTH;
    const nodeH = GraphComponent.NODE_HEIGHT;
    const colWidth = nodeW + 100;
    const rowGap = nodeH + 40;
    const headerY = 80;

    const groups = new Map<string, Ticket[]>();
    for (const ticket of tickets) {
      const key = this.getTicketGroupValue(ticket, groupBy);
      const list = groups.get(key) ?? [];
      list.push(ticket);
      groups.set(key, list);
    }

    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return a.localeCompare(b);
    });

    const columns: { label: string; x: number; points: number }[] = [];
    const nodes: GraphNode[] = [];

    sortedKeys.forEach((key, colIndex) => {
      const x = colIndex * colWidth + 100;

      let ticketsInCol = groups.get(key)!;
      const points = ticketsInCol.reduce((sum, t) => {
        const n = parseInt(t.complexity ?? '', 10);
        return isNaN(n) ? sum : sum + n;
      }, 0);
      columns.push({ label: this.formatGroupLabel(key, groupBy), x: x + nodeW / 2 - 40, points });
      if (sortBy !== '__none__') {
        ticketsInCol = [...ticketsInCol].sort((a, b) =>
          this.getTicketSortValue(a, sortBy).localeCompare(this.getTicketSortValue(b, sortBy))
        );
      }

      ticketsInCol.forEach((ticket, rowIndex) => {
        nodes.push({ ticket, x, y: headerY + rowIndex * rowGap, dragging: false });
      });
    });

    this.timelineColumns.set(columns);
    return nodes;
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
      const factor = 1 - event.deltaY * 0.008;
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
    this.assigneePicker.set(null);
    if (this.linkSource()) { this.cancelLink(); return; }
    if (this.draggingNode) return;

    // Middle mouse button → no action (browser default)
    if (event.button === 1) return;

    // In annotation mode, place an annotation on click
    const annotationType = this.addAnnotationMode();
    if (annotationType) {
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      const z = this.zoom();
      const x = (event.clientX - rect.left - this.panX()) / z - 20;
      const y = (event.clientY - rect.top - this.panY()) / z - 20;
      this.annotations.update(as => [...as, { id: crypto.randomUUID(), type: annotationType, x, y }]);
      this.addAnnotationMode.set(null);
      this.saveLayout();
      return;
    }

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

    if (this.draggingAnnotation) {
      const z = this.zoom();
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      const x = (event.clientX - rect.left - this.panX()) / z - this.annotationDragOffsetX;
      const y = (event.clientY - rect.top - this.panY()) / z - this.annotationDragOffsetY;
      const id = this.draggingAnnotation.id;
      this.annotations.update(as => as.map(a => a.id === id ? { ...a, x, y } : a));
      return;
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
    if (this.draggingAnnotation) {
      this.draggingAnnotation = null;
      this.saveLayout();
      return;
    }
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
    this.assigneePicker.set(null);
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

  // --- Annotations ---

  toggleAnnotationMode(type: AnnotationType): void {
    this.addAnnotationMode.update(current => current === type ? null : type);
  }

  onAnnotationMouseDown(event: MouseEvent, annotation: CanvasAnnotation): void {
    event.stopPropagation();
    const z = this.zoom();
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.draggingAnnotation = annotation;
    this.annotationDragOffsetX = (event.clientX - rect.left - this.panX()) / z - annotation.x;
    this.annotationDragOffsetY = (event.clientY - rect.top - this.panY()) / z - annotation.y;
  }

  onAnnotationRightClick(event: MouseEvent, annotation: CanvasAnnotation): void {
    event.preventDefault();
    event.stopPropagation();
    this.annotations.update(as => as.filter(a => a.id !== annotation.id));
    this.saveLayout();
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

  // --- Persistence (backend + localStorage fallback) ---

  private get layoutKey(): string {
    const team = this.teamConfigService.selectedTeam();
    const epics = this.teamConfigService.selectedEpics();
    const epicKey = epics.map(e => e.id).sort().join('_');
    return `graph_layout_${team?.id}_${epicKey}`;
  }

  private get layoutEpicKey(): string {
    return this.teamConfigService.selectedEpics().map(e => e.id).sort().join('_');
  }

  saveLayout(): void {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of this.nodes()) {
      positions[n.ticket.notionId] = { x: n.x, y: n.y };
    }
    const data: LayoutData = {
      positions,
      groups: this.groups(),
      annotations: this.annotations(),
      zoom: this.zoom(),
      panX: this.panX(),
      panY: this.panY(),
    };

    try { localStorage.setItem(this.layoutKey, JSON.stringify(data)); } catch {}

    const team = this.teamConfigService.selectedTeam();
    if (!team) return;
    const epicKey = this.layoutEpicKey;
    this.http.put(`/api/layouts/${team.id}/${epicKey}`, data).subscribe({
      error: err => console.error('Failed to save layout to backend:', err),
    });
  }

  private async fetchLayout(): Promise<LayoutData | null> {
    const team = this.teamConfigService.selectedTeam();
    const epics = this.teamConfigService.selectedEpics();
    if (!team || epics.length === 0) return null;
    const epicKey = this.layoutEpicKey;

    const data = await firstValueFrom(
      this.http.get<LayoutData>(`/api/layouts/${team.id}/${epicKey}`).pipe(
        catchError(() => of(null))
      )
    );

    if (data) {
      try { localStorage.setItem(this.layoutKey, JSON.stringify(data)); } catch {}
      return data;
    }

    const raw = localStorage.getItem(this.layoutKey);
    if (!raw) return null;
    try { return JSON.parse(raw) as LayoutData; } catch { return null; }
  }

  private applyLayout(nodes: GraphNode[], data: LayoutData): GraphNode[] {
    if (data.groups) this.groups.set(data.groups);
    if (data.annotations) this.annotations.set(data.annotations);
    if (data.zoom) this.zoom.set(data.zoom);
    if (data.panX !== undefined) this.panX.set(data.panX);
    if (data.panY !== undefined) this.panY.set(data.panY);

    if (data.positions) {
      return nodes.map(n => {
        const pos = data.positions[n.ticket.notionId];
        return pos ? { ...n, x: pos.x, y: pos.y } : n;
      });
    }
    return nodes;
  }

  private resolveOverlaps(nodes: GraphNode[]): GraphNode[] {
    const nodeW = GraphComponent.NODE_WIDTH;
    const nodeH = GraphComponent.NODE_HEIGHT;
    const padding = 20;
    const result = nodes.map(n => ({ ...n }));

    for (let pass = 0; pass < 5; pass++) {
      let anyOverlap = false;
      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const a = result[i];
          const b = result[j];
          const overlapX = (a.x < b.x + nodeW + padding) && (b.x < a.x + nodeW + padding);
          const overlapY = (a.y < b.y + nodeH + padding) && (b.y < a.y + nodeH + padding);
          if (overlapX && overlapY) {
            anyOverlap = true;
            const pushX = (a.x + nodeW + padding) - b.x;
            const pushY = (a.y + nodeH + padding) - b.y;
            if (pushX < pushY) {
              b.x += pushX;
            } else {
              b.y += pushY;
            }
          }
        }
      }
      if (!anyOverlap) break;
    }

    return result;
  }
}

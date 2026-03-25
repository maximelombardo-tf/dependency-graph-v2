import {
  Component,
  input,
  inject,
  signal,
  effect,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  ChangeDetectionStrategy,
  HostListener,
  output,
} from '@angular/core';
import { DependencyService } from '../../../core/services/dependency.service';
import { Dependency, ArrowPath } from '../../../core/models/dependency.model';

@Component({
  selector: 'app-dependency-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="absolute top-0 left-0 pointer-events-none"
      [attr.width]="svgWidth()"
      [attr.height]="svgHeight()"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280" />
        </marker>
        <marker
          id="arrowhead-hover"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#EF4444" />
        </marker>
      </defs>

      <!-- Existing dependency arrows -->
      @for (arrow of arrowPaths(); track arrow.id) {
        <g class="pointer-events-auto cursor-pointer group">
          <!-- Invisible wider path for easier hover/click -->
          <path
            [attr.d]="arrow.path"
            fill="none"
            stroke="transparent"
            stroke-width="16"
            (contextmenu)="onArrowRightClick($event, arrow)"
          />
          <!-- Visible path -->
          <path
            [attr.d]="arrow.path"
            fill="none"
            stroke="#6B7280"
            stroke-width="2"
            marker-end="url(#arrowhead)"
            class="transition-colors hover:stroke-red-500 [&:hover]:marker-end-[url(#arrowhead-hover)]"
            (contextmenu)="onArrowRightClick($event, arrow)"
          />
        </g>
      }

      <!-- Pending link arrow -->
      @if (pendingPath()) {
        <path
          [attr.d]="pendingPath()"
          fill="none"
          stroke="#3B82F6"
          stroke-width="2"
          stroke-dasharray="8 4"
          marker-end="url(#arrowhead)"
        />
      }
    </svg>

    <!-- Context menu -->
    @if (contextMenu()) {
      <div
        class="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1"
        [style.left.px]="contextMenu()!.x"
        [style.top.px]="contextMenu()!.y"
      >
        <button
          class="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
          (click)="deleteArrow()"
        >
          Supprimer la dépendance
        </button>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 5;
    }
  `],
})
export class DependencyOverlayComponent implements AfterViewInit, OnDestroy {
  readonly dependencies = input.required<Dependency[]>();
  readonly ticketElements = input.required<Map<string, HTMLElement>>();
  readonly scrollContainer = input.required<HTMLElement>();

  readonly deleteDependency = output<{ fromTicketId: string; toTicketId: string }>();

  readonly dependencyService = inject(DependencyService);

  readonly arrowPaths = signal<ArrowPath[]>([]);
  readonly pendingPath = signal<string | null>(null);
  readonly svgWidth = signal(0);
  readonly svgHeight = signal(0);
  readonly contextMenu = signal<{ x: number; y: number; arrow: ArrowPath } | null>(null);

  private resizeObserver: ResizeObserver | null = null;
  private scrollListener: (() => void) | null = null;
  private rafId: number | null = null;

  constructor() {
    effect(() => {
      this.dependencies();
      this.ticketElements();
      this.scheduleRefresh();
    });

    effect(() => {
      const mousePos = this.dependencyService.pendingMousePos();
      const source = this.dependencyService.linkSource();
      if (mousePos && source) {
        const sourceEl = this.ticketElements().get(source.ticketId);
        const container = this.scrollContainer();
        if (sourceEl && container) {
          const path = this.dependencyService.computePendingArrowPath(
            sourceEl, mousePos, container, source.side
          );
          this.pendingPath.set(path);
        }
      } else {
        this.pendingPath.set(null);
      }
    });
  }

  ngAfterViewInit(): void {
    const container = this.scrollContainer();
    if (container) {
      this.resizeObserver = new ResizeObserver(() => this.scheduleRefresh());
      this.resizeObserver.observe(container);

      const onScroll = () => this.scheduleRefresh();
      container.addEventListener('scroll', onScroll);
      this.scrollListener = () => container.removeEventListener('scroll', onScroll);
    }
    this.scheduleRefresh();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.scrollListener?.();
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.contextMenu.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.contextMenu.set(null);
    this.dependencyService.cancelLink();
  }

  onArrowRightClick(event: MouseEvent, arrow: ArrowPath): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.set({ x: event.clientX, y: event.clientY, arrow });
  }

  deleteArrow(): void {
    const menu = this.contextMenu();
    if (menu) {
      this.deleteDependency.emit({
        fromTicketId: menu.arrow.fromTicketId,
        toTicketId: menu.arrow.toTicketId,
      });
      this.contextMenu.set(null);
    }
  }

  private scheduleRefresh(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => this.refreshPaths());
  }

  private refreshPaths(): void {
    const container = this.scrollContainer();
    if (!container) return;

    this.svgWidth.set(container.scrollWidth);
    this.svgHeight.set(container.scrollHeight);

    const paths = this.dependencyService.computeArrowPaths(
      this.dependencies(),
      this.ticketElements(),
      container,
    );
    this.arrowPaths.set(paths);
  }
}

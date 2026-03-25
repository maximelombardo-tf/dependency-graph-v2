import { Injectable, signal, computed } from '@angular/core';
import { Ticket } from '../models/ticket.model';
import { Dependency, ArrowPath } from '../models/dependency.model';

@Injectable({ providedIn: 'root' })
export class DependencyService {
  readonly dependencies = signal<Dependency[]>([]);
  readonly isLinkMode = signal(false);
  readonly linkSource = signal<{ ticketId: string; side: 'left' | 'right' } | null>(null);
  readonly pendingMousePos = signal<{ x: number; y: number } | null>(null);

  buildDependenciesFromTickets(tickets: Ticket[]): Dependency[] {
    const deps: Dependency[] = [];
    const ticketIds = new Set(tickets.map(t => t.notionId));

    for (const ticket of tickets) {
      for (const depId of ticket.dependencyIds) {
        if (ticketIds.has(depId)) {
          deps.push({ fromTicketId: ticket.notionId, toTicketId: depId });
        }
      }
    }

    this.dependencies.set(deps);
    return deps;
  }

  startLink(ticketId: string, side: 'left' | 'right'): void {
    this.isLinkMode.set(true);
    this.linkSource.set({ ticketId, side });
  }

  cancelLink(): void {
    this.isLinkMode.set(false);
    this.linkSource.set(null);
    this.pendingMousePos.set(null);
  }

  addDependency(fromTicketId: string, toTicketId: string): void {
    const current = this.dependencies();
    const exists = current.some(d => d.fromTicketId === fromTicketId && d.toTicketId === toTicketId);
    if (!exists && fromTicketId !== toTicketId) {
      this.dependencies.set([...current, { fromTicketId, toTicketId }]);
    }
    this.cancelLink();
  }

  removeDependency(fromTicketId: string, toTicketId: string): void {
    this.dependencies.set(
      this.dependencies().filter(d => !(d.fromTicketId === fromTicketId && d.toTicketId === toTicketId))
    );
  }

  computeArrowPaths(
    dependencies: Dependency[],
    ticketElements: Map<string, HTMLElement>,
    scrollContainer: HTMLElement,
  ): ArrowPath[] {
    const scrollRect = scrollContainer.getBoundingClientRect();
    const scrollLeft = scrollContainer.scrollLeft;
    const scrollTop = scrollContainer.scrollTop;

    return dependencies
      .map(dep => {
        const fromEl = ticketElements.get(dep.fromTicketId);
        const toEl = ticketElements.get(dep.toTicketId);
        if (!fromEl || !toEl) return null;

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();

        // Positions relatives au scroll container
        const fromX = fromRect.right - scrollRect.left + scrollLeft;
        const fromY = fromRect.top + fromRect.height / 2 - scrollRect.top + scrollTop;
        const toX = toRect.left - scrollRect.left + scrollLeft;
        const toY = toRect.top + toRect.height / 2 - scrollRect.top + scrollTop;

        const path = this.buildBezierPath(fromX, fromY, toX, toY);

        return {
          id: `${dep.fromTicketId}-${dep.toTicketId}`,
          fromTicketId: dep.fromTicketId,
          toTicketId: dep.toTicketId,
          path,
        };
      })
      .filter((p): p is ArrowPath => p !== null);
  }

  computePendingArrowPath(
    sourceElement: HTMLElement,
    mousePos: { x: number; y: number },
    scrollContainer: HTMLElement,
    side: 'left' | 'right',
  ): string {
    const scrollRect = scrollContainer.getBoundingClientRect();
    const scrollLeft = scrollContainer.scrollLeft;
    const scrollTop = scrollContainer.scrollTop;
    const sourceRect = sourceElement.getBoundingClientRect();

    const fromX = side === 'right'
      ? sourceRect.right - scrollRect.left + scrollLeft
      : sourceRect.left - scrollRect.left + scrollLeft;
    const fromY = sourceRect.top + sourceRect.height / 2 - scrollRect.top + scrollTop;
    const toX = mousePos.x - scrollRect.left + scrollLeft;
    const toY = mousePos.y - scrollRect.top + scrollTop;

    return this.buildBezierPath(fromX, fromY, toX, toY);
  }

  private buildBezierPath(fromX: number, fromY: number, toX: number, toY: number): string {
    const dx = Math.abs(toX - fromX);
    const offset = Math.max(60, dx * 0.4);

    return `M ${fromX} ${fromY} C ${fromX + offset} ${fromY}, ${toX - offset} ${toY}, ${toX} ${toY}`;
  }
}

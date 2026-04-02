import { Component, input, output, inject, ChangeDetectionStrategy } from '@angular/core';
import { Ticket } from '../../../core/models/ticket.model';
import { TeamConfigService } from '../../../core/services/team-config.service';

@Component({
  selector: 'app-ticket-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ticket-id]': 'ticket().notionId',
  },
  template: `
    <div
      class="group relative bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
      (click)="onCardClick($event)"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <a
            [href]="ticket().notionUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm font-medium text-gray-900 hover:text-blue-600 line-clamp-2"
            (click)="$event.stopPropagation()"
          >
            {{ ticket().title }}
          </a>
        </div>
      </div>

      <div class="mt-2 flex items-center justify-between">
        <span class="text-xs text-gray-500">{{ ticket().id }}</span>

        <div class="flex items-center gap-2">
          @if (ticket().complexity) {
            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
              {{ ticket().complexity }}
            </span>
          }
          @if (ticket().assignee) {
            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 max-w-[80px] truncate">
              {{ ticket().assignee }}
            </span>
          }
        </div>
      </div>

      @for (field of teamConfigService.extraDisplayFields(); track field) {
        @if (ticket().extraFields[field]) {
          <div class="mt-1 flex items-center gap-1">
            <span class="text-xs text-gray-400">{{ field }}:</span>
            <span class="text-xs text-gray-600 truncate">{{ ticket().extraFields[field] }}</span>
          </div>
        }
      }

      @if (ticket().dependencyIds.length > 0) {
        <div class="mt-1.5 flex items-center gap-1">
          <span class="text-xs text-orange-600">
            {{ ticket().dependencyIds.length }} dep{{ ticket().dependencyIds.length > 1 ? 's' : '' }}
          </span>
        </div>
      }
    </div>
  `,
})
export class TicketCardComponent {
  readonly teamConfigService = inject(TeamConfigService);
  readonly ticket = input.required<Ticket>();
  readonly isLinkMode = input(false);

  readonly linkStart = output<{ ticketId: string; side: 'left' | 'right' }>();
  readonly linkEnd = output<{ ticketId: string }>();

  onCardClick(event: MouseEvent): void {
    if (this.isLinkMode()) {
      event.stopPropagation();
      this.linkEnd.emit({ ticketId: this.ticket().notionId });
    }
  }

  onLinkStart(event: MouseEvent, side: 'left' | 'right'): void {
    event.stopPropagation();
    event.preventDefault();
    this.linkStart.emit({ ticketId: this.ticket().notionId, side });
  }
}

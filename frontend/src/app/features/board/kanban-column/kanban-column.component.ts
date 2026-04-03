import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CdkDropList, CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop';
import { Ticket } from '../../../core/models/ticket.model';
import { TicketCardComponent } from '../ticket-card/ticket-card.component';

@Component({
  selector: 'app-kanban-column',
  standalone: true,
  imports: [CdkDropList, CdkDrag, TicketCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full min-w-[280px] max-w-[280px] bg-gray-100 rounded-lg">
      <div class="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <h3 class="text-sm font-semibold text-gray-700">{{ columnName() }}</h3>
        <span class="text-xs text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">
          {{ tickets().length }}
        </span>
      </div>

      <div
        cdkDropList
        [cdkDropListData]="tickets()"
        [id]="columnId()"
        [cdkDropListConnectedTo]="connectedTo()"
        (cdkDropListDropped)="onDrop($event)"
        class="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]"
      >
        @for (ticket of tickets(); track ticket.notionId) {
          <div cdkDrag [cdkDragData]="ticket">
            <app-ticket-card
              [ticket]="ticket"
              [isLinkMode]="isLinkMode()"
              (linkStart)="linkStart.emit($event)"
              (linkEnd)="linkEnd.emit($event)"
              (cardClicked)="cardClicked.emit($event)"
            />
          </div>
        }

        @if (tickets().length === 0) {
          <div class="flex items-center justify-center h-20 text-xs text-gray-400 border-2 border-dashed border-gray-300 rounded-lg">
            Aucun ticket
          </div>
        }
      </div>
    </div>
  `,
})
export class KanbanColumnComponent {
  readonly columnName = input.required<string>();
  readonly columnId = input.required<string>();
  readonly tickets = input.required<Ticket[]>();
  readonly connectedTo = input<string[]>([]);
  readonly isLinkMode = input(false);

  readonly ticketDropped = output<{ ticket: Ticket; newColumnId: string; previousIndex: number; currentIndex: number }>();
  readonly linkStart = output<{ ticketId: string; side: 'left' | 'right' }>();
  readonly linkEnd = output<{ ticketId: string }>();
  readonly cardClicked = output<{ ticket: Ticket; x: number; y: number }>();

  onDrop(event: CdkDragDrop<Ticket[]>): void {
    if (event.previousContainer === event.container && event.previousIndex === event.currentIndex) {
      return;
    }
    this.ticketDropped.emit({
      ticket: event.item.data,
      newColumnId: event.container.id,
      previousIndex: event.previousIndex,
      currentIndex: event.currentIndex,
    });
  }
}

import { Component, inject } from '@angular/core';
import { ToastService, Toast } from './toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  template: `
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="flex items-start gap-3 p-4 rounded-lg shadow-lg border animate-slide-in"
          [class]="toastClass(toast)"
          role="alert"
        >
          <p class="text-sm flex-1">{{ toast.message }}</p>
          <button
            class="text-current opacity-60 hover:opacity-100 shrink-0"
            (click)="toastService.dismiss(toast.id)"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .animate-slide-in { animation: slide-in 0.3s ease-out; }
  `],
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);

  toastClass(toast: Toast): string {
    switch (toast.type) {
      case 'error': return 'bg-red-50 border-red-200 text-red-700';
      case 'success': return 'bg-green-50 border-green-200 text-green-700';
      case 'info': return 'bg-blue-50 border-blue-200 text-blue-700';
    }
  }
}

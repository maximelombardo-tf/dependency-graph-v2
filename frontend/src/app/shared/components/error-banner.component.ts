import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-error-banner',
  standalone: true,
  template: `
    <div class="p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
      <div class="flex items-start gap-3">
        <svg class="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="flex-1">
          <p class="text-sm text-red-700">{{ message() }}</p>
          @if (retryable()) {
            <button
              class="mt-2 text-sm text-red-600 hover:text-red-800 underline"
              (click)="retry.emit()"
            >
              Réessayer
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class ErrorBannerComponent {
  readonly message = input.required<string>();
  readonly retryable = input(true);
  readonly retry = output();
}

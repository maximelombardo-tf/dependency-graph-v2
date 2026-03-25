import { Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  template: `
    <div class="flex items-center justify-center" [class]="containerClass()">
      <div
        class="border-4 border-t-transparent rounded-full animate-spin"
        [class]="sizeClass()"
        [style.border-color]="color()"
        style="border-top-color: transparent"
      ></div>
    </div>
  `,
})
export class LoadingSpinnerComponent {
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly color = input('#3B82F6');
  readonly containerClass = input('');

  readonly sizeClass = () => {
    switch (this.size()) {
      case 'sm': return 'w-4 h-4 border-2';
      case 'md': return 'w-8 h-8 border-4';
      case 'lg': return 'w-12 h-12 border-4';
    }
  };
}

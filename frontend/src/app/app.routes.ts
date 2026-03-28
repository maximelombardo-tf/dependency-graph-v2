import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent) },
  { path: 'board', loadComponent: () => import('./features/board/board.component').then(m => m.BoardComponent), canActivate: [authGuard] },
  { path: 'graph', loadComponent: () => import('./features/graph/graph.component').then(m => m.GraphComponent), canActivate: [authGuard] },
  { path: '', redirectTo: 'graph', pathMatch: 'full' },
  { path: '**', redirectTo: 'graph' },
];

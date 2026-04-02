import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent) },
  { path: 'board/:teamName', loadComponent: () => import('./features/board/board.component').then(m => m.BoardComponent), canActivate: [authGuard] },
  { path: 'board', loadComponent: () => import('./features/board/board.component').then(m => m.BoardComponent), canActivate: [authGuard] },
  { path: 'graph/:teamName', loadComponent: () => import('./features/graph/graph.component').then(m => m.GraphComponent), canActivate: [authGuard] },
  { path: 'graph', loadComponent: () => import('./features/graph/graph.component').then(m => m.GraphComponent), canActivate: [authGuard] },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent),
    children: [
      { path: 'login', loadComponent: () => import('./features/admin/admin-login/admin-login.component').then(m => m.AdminLoginComponent) },
      { path: 'teams', loadComponent: () => import('./features/admin/admin-teams/admin-teams.component').then(m => m.AdminTeamsComponent), canActivate: [adminGuard] },
      { path: '', redirectTo: 'teams', pathMatch: 'full' },
    ],
  },
  { path: '', redirectTo: 'graph', pathMatch: 'full' },
  { path: '**', redirectTo: 'graph' },
];

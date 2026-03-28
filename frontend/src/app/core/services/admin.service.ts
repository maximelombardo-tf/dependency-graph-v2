import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { TeamConfig } from '../models/team-config.model';

export interface TeamWithToken extends TeamConfig {
  notionApiToken?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  private get adminToken(): string | null {
    return localStorage.getItem('adminToken');
  }

  private get authHeaders(): HttpHeaders {
    return new HttpHeaders({ 'X-Admin-Token': this.adminToken || '' });
  }

  isAuthenticated(): boolean {
    return !!this.adminToken;
  }

  login(password: string): Observable<void> {
    return this.http.post<{ token: string }>('/api/admin/auth', { password }).pipe(
      tap(({ token }) => localStorage.setItem('adminToken', token)),
      map(() => void 0)
    );
  }

  logout(): void {
    localStorage.removeItem('adminToken');
  }

  getTeams(): Observable<TeamWithToken[]> {
    return this.http.get<TeamWithToken[]>('/api/admin/teams', { headers: this.authHeaders });
  }

  createTeam(team: Omit<TeamConfig, 'id'> & { notionApiToken: string }): Observable<TeamConfig> {
    return this.http.post<TeamConfig>('/api/admin/teams', team, { headers: this.authHeaders });
  }

  updateTeam(team: TeamConfig & { notionApiToken?: string }): Observable<TeamConfig> {
    return this.http.put<TeamConfig>('/api/admin/teams', team, { headers: this.authHeaders });
  }

  deleteTeam(id: string): Observable<void> {
    return this.http.delete<void>(`/api/admin/teams?id=${id}`, { headers: this.authHeaders });
  }
}

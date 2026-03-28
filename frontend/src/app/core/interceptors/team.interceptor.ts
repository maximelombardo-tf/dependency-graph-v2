import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { TeamConfigService } from '../services/team-config.service';

@Injectable()
export class TeamInterceptor implements HttpInterceptor {
  private readonly teamConfigService = inject(TeamConfigService);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const team = this.teamConfigService.selectedTeam();
    if (team && req.url.includes('/api/notion')) {
      const teamReq = req.clone({
        setHeaders: { 'X-Team-Id': team.id },
      });
      return next.handle(teamReq);
    }
    return next.handle(req);
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, expand, reduce, map, retry, timer, EMPTY } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TeamConfig, EpicFilterCondition } from '../models/team-config.model';
import { Ticket, Assignee, Epic, NotionPage, NotionQueryResponse } from '../models/ticket.model';

@Injectable({ providedIn: 'root' })
export class NotionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/notion`;

  queryDatabase(databaseId: string, filter?: object, sorts?: object[]): Observable<NotionPage[]> {
    const body: Record<string, any> = { page_size: 100 };
    if (filter) body['filter'] = filter;
    if (sorts) body['sorts'] = sorts;

    return this.queryDatabasePage(databaseId, body, null).pipe(
      expand(response =>
        response.has_more && response.next_cursor
          ? this.queryDatabasePage(databaseId, body, response.next_cursor)
          : EMPTY
      ),
      reduce((acc: NotionPage[], response) => [...acc, ...response.results], []),
      this.retryOnRateLimit(),
    );
  }

  private queryDatabasePage(
    databaseId: string,
    body: Record<string, any>,
    startCursor: string | null,
  ): Observable<NotionQueryResponse> {
    const payload = startCursor ? { ...body, start_cursor: startCursor } : body;
    return this.http.post<NotionQueryResponse>(
      `${this.baseUrl}/databases/${databaseId}/query`,
      payload,
    );
  }

  updatePageProperty(pageId: string, properties: Record<string, any>): Observable<any> {
    return this.http.patch(`${this.baseUrl}/pages/${pageId}`, { properties }).pipe(
      this.retryOnRateLimit(),
    );
  }

  archivePage(pageId: string): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/pages/${pageId}`, { archived: true }).pipe(
      this.retryOnRateLimit(),
    );
  }

  getEpicsForTeam(teamConfig: TeamConfig): Observable<Epic[]> {
    const filter = teamConfig.epicFilter?.length
      ? this.buildEpicFilter(teamConfig.epicFilter)
      : undefined;

    return this.querySinglePage(teamConfig.epicDatabaseId, filter).pipe(
      map(pages =>
        pages.map(page => this.mapToEpic(page, teamConfig))
          .sort((a, b) => a.title.localeCompare(b.title))
      ),
    );
  }

  /** Fetch only the first page (100 results max) - no pagination. */
  private querySinglePage(databaseId: string, filter?: object, sorts?: object[]): Observable<NotionPage[]> {
    const body: Record<string, any> = { page_size: 100 };
    if (filter) body['filter'] = filter;
    if (sorts) body['sorts'] = sorts;

    return this.http.post<NotionQueryResponse>(
      `${this.baseUrl}/databases/${databaseId}/query`,
      body,
    ).pipe(
      map(response => response.results),
      this.retryOnRateLimit(),
    );
  }

  getTicketsForEpic(teamConfig: TeamConfig, epicId: string): Observable<Ticket[]> {
    return this.getTicketsForEpics(teamConfig, [epicId]);
  }

  getTicketsForEpics(teamConfig: TeamConfig, epicIds: string[]): Observable<Ticket[]> {
    if (epicIds.length === 0) return new Observable(sub => { sub.next([]); sub.complete(); });

    // Epic relation filter
    const epicFilter = epicIds.length === 1
      ? { property: teamConfig.propertiesName.epic, relation: { contains: epicIds[0] } }
      : { or: epicIds.map(id => ({ property: teamConfig.propertiesName.epic, relation: { contains: id } })) };

    // Combine with ticketFilter if configured
    const ticketFilterClauses = teamConfig.ticketFilter?.length
      ? this.buildEpicFilter(teamConfig.ticketFilter)
      : null;

    const filter = ticketFilterClauses
      ? { and: [epicFilter, ticketFilterClauses] }
      : epicFilter;

    return this.queryDatabase(teamConfig.usDatabaseId, filter).pipe(
      map(pages => {
        const seen = new Set<string>();
        return pages
          .map(page => this.mapToTicket(page, teamConfig))
          .filter(ticket => {
            if (seen.has(ticket.notionId)) return false;
            seen.add(ticket.notionId);
            return true;
          });
      }),
    );
  }

  /** Fetch epic IDs that have at least one ticket matching the ticketFilter. Returns null if no ticketFilter. */
  getRelevantEpicIds(teamConfig: TeamConfig): Observable<Set<string> | null> {
    if (!teamConfig.ticketFilter?.length) {
      return of(null);
    }

    const filter = this.buildEpicFilter(teamConfig.ticketFilter);
    return this.querySinglePage(teamConfig.usDatabaseId, filter).pipe(
      map(pages => {
        const epicIds = new Set<string>();
        for (const page of pages) {
          const epicRel = page.properties[teamConfig.propertiesName.epic];
          if (epicRel?.type === 'relation' && epicRel.relation) {
            for (const r of epicRel.relation) {
              epicIds.add(r.id);
            }
          }
        }
        return epicIds;
      }),
    );
  }

  addDependency(
    pageId: string,
    currentDepIds: string[],
    newDepId: string,
    propertyName: string,
  ): Observable<any> {
    const relationIds = [...currentDepIds, newDepId].map(id => ({ id }));
    return this.updatePageProperty(pageId, {
      [propertyName]: { relation: relationIds },
    });
  }

  removeDependency(
    pageId: string,
    currentDepIds: string[],
    removeDepId: string,
    propertyName: string,
  ): Observable<any> {
    const relationIds = currentDepIds
      .filter(id => id !== removeDepId)
      .map(id => ({ id }));
    return this.updatePageProperty(pageId, {
      [propertyName]: { relation: relationIds },
    });
  }

  private buildEpicFilter(conditions: EpicFilterCondition[]): object {
    const toNotionCondition = (c: EpicFilterCondition) => ({
      property: c.property,
      [c.type]: {
        [c.type === 'multi_select' ? 'contains' : 'equals']: c.value,
      },
    });

    // Group conditions by property name
    const grouped = new Map<string, EpicFilterCondition[]>();
    for (const c of conditions) {
      const list = grouped.get(c.property) ?? [];
      list.push(c);
      grouped.set(c.property, list);
    }

    // For each property: single condition stays as-is, multiple conditions get OR'd
    const clauses: object[] = [];
    for (const group of grouped.values()) {
      if (group.length === 1) {
        clauses.push(toNotionCondition(group[0]));
      } else {
        clauses.push({ or: group.map(toNotionCondition) });
      }
    }

    return clauses.length === 1 ? clauses[0] : { and: clauses };
  }

  private mapToTicket(page: NotionPage, config: TeamConfig): Ticket {
    const props = page.properties;
    const pNames = config.propertiesName;

    const coreProps = new Set([pNames.id, pNames.title, pNames.status, pNames.complexity, pNames.bloque, pNames.epic, pNames.assignedTo]);
    const extraFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(props)) {
      if (coreProps.has(key)) continue;
      const extracted = this.extractAny(value);
      if (extracted) extraFields[key] = extracted;
    }

    return {
      id: this.extractText(props[pNames.id]) || page.id,
      notionId: page.id,
      title: this.extractTitle(props[pNames.title]),
      status: this.extractSelect(props[pNames.status]),
      assignee: this.extractPeople(props[pNames.assignedTo]),
      assignees: this.extractAllPeople(props[pNames.assignedTo]),
      complexity: this.extractText(props[pNames.complexity]) || this.extractSelect(props[pNames.complexity]) || null,
      dependencyIds: this.extractRelation(props[pNames.bloque]),
      epicIds: this.extractRelation(props[pNames.epic]),
      notionUrl: page.url,
      extraFields,
    };
  }

  private mapToEpic(page: NotionPage, config: TeamConfig): Epic {
    const props = page.properties;
    return {
      id: page.id,
      title: this.extractTitle(props[config.propertiesName.epicName]),
    };
  }

  private extractTitle(prop: any): string {
    if (!prop) return 'Sans titre';
    if (prop.type === 'title' && prop.title?.length > 0) {
      return prop.title.map((t: any) => t.plain_text).join('');
    }
    return 'Sans titre';
  }

  private extractSelect(prop: any): string {
    if (!prop) return '';
    if (prop.type === 'select' && prop.select) {
      return prop.select.name || '';
    }
    if (prop.type === 'status' && prop.status) {
      return prop.status.name || '';
    }
    return '';
  }

  private extractText(prop: any): string {
    if (!prop) return '';
    if (prop.type === 'unique_id' && prop.unique_id) {
      const prefix = prop.unique_id.prefix ? `${prop.unique_id.prefix}-` : '';
      return `${prefix}${prop.unique_id.number}`;
    }
    if (prop.type === 'rich_text' && prop.rich_text?.length > 0) {
      return prop.rich_text.map((t: any) => t.plain_text).join('');
    }
    if (prop.type === 'number' && prop.number != null) {
      return String(prop.number);
    }
    return '';
  }

  private extractPeople(prop: any): string | null {
    if (!prop) return null;
    if (prop.type === 'people' && prop.people?.length > 0) {
      return prop.people[0].name || prop.people[0].person?.email || null;
    }
    return null;
  }

  private extractAllPeople(prop: any): Assignee[] {
    if (!prop || prop.type !== 'people' || !prop.people) return [];
    return prop.people
      .filter((p: any) => p.name && p.id)
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.avatar_url || null,
      }));
  }

  private extractRelation(prop: any): string[] {
    if (!prop) return [];
    if (prop.type === 'relation' && prop.relation) {
      return prop.relation.map((r: any) => r.id);
    }
    return [];
  }

  private extractAny(prop: any): string {
    if (!prop) return '';
    const type = prop.type;
    if (type === 'title') return this.extractTitle(prop);
    if (type === 'rich_text') return this.extractText(prop);
    if (type === 'number' && prop.number != null) return String(prop.number);
    if (type === 'unique_id') return this.extractText(prop);
    if (type === 'select' && prop.select) return prop.select.name || '';
    if (type === 'status' && prop.status) return prop.status.name || '';
    if (type === 'multi_select' && prop.multi_select) return prop.multi_select.map((s: any) => s.name).join(', ');
    if (type === 'checkbox') return prop.checkbox === true ? 'Oui' : 'Non';
    if (type === 'date' && prop.date?.start) return prop.date.start;
    if (type === 'people') return (prop.people || []).map((p: any) => p.name).filter(Boolean).join(', ');
    if (type === 'formula') {
      const f = prop.formula;
      if (f.type === 'string') return f.string || '';
      if (f.type === 'number' && f.number != null) return String(f.number);
      if (f.type === 'boolean') return f.boolean ? 'Oui' : 'Non';
      if (f.type === 'date' && f.date?.start) return f.date.start;
    }
    if (type === 'rollup') {
      const r = prop.rollup;
      if (r.type === 'number' && r.number != null) return String(r.number);
      if (r.type === 'array' && r.array) return r.array.map((item: any) => this.extractAny(item)).filter(Boolean).join(', ');
    }
    if (type === 'url' && prop.url) return prop.url;
    if (type === 'email' && prop.email) return prop.email;
    if (type === 'phone_number' && prop.phone_number) return prop.phone_number;
    if (type === 'created_time' && prop.created_time) return prop.created_time.split('T')[0];
    if (type === 'last_edited_time' && prop.last_edited_time) return prop.last_edited_time.split('T')[0];
    if (type === 'files' && prop.files?.length > 0) return prop.files.map((f: any) => f.name || f.external?.url || f.file?.url || '').filter(Boolean).join(', ');
    if (type === 'relation' && prop.relation?.length > 0) return `${prop.relation.length} lien(s)`;
    return '';
  }

  private retryOnRateLimit<T>() {
    return (source: Observable<T>) =>
      source.pipe(
        retry({
          count: 3,
          delay: (error, retryCount) => {
            if (error?.status === 429) {
              const delay = Math.pow(2, retryCount) * 1000;
              console.warn(`Notion rate limit hit, retrying in ${delay}ms...`);
              return timer(delay);
            }
            throw error;
          },
        }),
      );
  }
}

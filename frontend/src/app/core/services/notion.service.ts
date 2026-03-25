import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, expand, reduce, map, retry, timer, EMPTY } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TeamConfig } from '../models/team-config.model';
import { Ticket, Epic, NotionPage, NotionQueryResponse } from '../models/ticket.model';

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

  getEpicsForTeam(teamConfig: TeamConfig): Observable<Epic[]> {
    const filter = teamConfig.epicFilter?.length
      ? {
          and: teamConfig.epicFilter.map(condition => ({
            property: condition.property,
            [condition.type]: {
              [condition.type === 'multi_select' ? 'contains' : 'equals']: condition.value,
            },
          })),
        }
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
    const filter = {
      property: teamConfig.propertiesName.epic,
      relation: { contains: epicId },
    };

    return this.queryDatabase(teamConfig.usDatabaseId, filter).pipe(
      map(pages => pages.map(page => this.mapToTicket(page, teamConfig))),
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

  private mapToTicket(page: NotionPage, config: TeamConfig): Ticket {
    const props = page.properties;
    const pNames = config.propertiesName;

    return {
      id: this.extractText(props[pNames.id]) || page.id,
      notionId: page.id,
      title: this.extractTitle(props[pNames.title]),
      status: this.extractSelect(props[pNames.status]),
      assignee: this.extractPeople(props[pNames.assignedTo]),
      complexity: this.extractSelect(props[pNames.complexity]),
      dependencyIds: this.extractRelation(props[pNames.bloque]),
      notionUrl: page.url,
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

  private extractRelation(prop: any): string[] {
    if (!prop) return [];
    if (prop.type === 'relation' && prop.relation) {
      return prop.relation.map((r: any) => r.id);
    }
    return [];
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

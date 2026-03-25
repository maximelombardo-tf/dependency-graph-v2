export interface Ticket {
  id: string;
  notionId: string;
  title: string;
  status: string;
  assignee: string | null;
  complexity: string | null;
  dependencyIds: string[];
  notionUrl: string;
}

export interface Epic {
  id: string;
  title: string;
}

export interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, any>;
}

export interface NotionQueryResponse {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

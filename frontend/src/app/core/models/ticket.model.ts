export interface Assignee {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Ticket {
  id: string;
  notionId: string;
  title: string;
  status: string;
  assignee: string | null;
  assignees: Assignee[];
  complexity: string | null;
  dependencyIds: string[];
  epicIds: string[];
  notionUrl: string;
  extraFields: Record<string, string>;
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

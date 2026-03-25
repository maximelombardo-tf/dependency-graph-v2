export interface Dependency {
  fromTicketId: string;
  toTicketId: string;
}

export interface ArrowPath {
  id: string;
  fromTicketId: string;
  toTicketId: string;
  path: string;
}

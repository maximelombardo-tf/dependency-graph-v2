export interface StatusMapping {
  backlogToPrepare: string[];
  toChallenge: string[];
  toStrat: string[];
  toDev: string[];
  sprintBacklog: string[];
  isInProgress: string[];
  done: string[];
  toValidate: string[];
  blocked: string[];
}

export interface PropertiesName {
  id: string;
  title: string;
  status: string;
  complexity: string;
  bloque: string;
  statuses: StatusMapping;
  epic: string;
  epicName: string;
  assignedTo: string;
}

export interface EpicFilterCondition {
  property: string;
  type: 'status' | 'select' | 'multi_select';
  value: string;
}

export type EpicFilter = EpicFilterCondition[];

export interface TeamConfig {
  id: string;
  name: string;
  epicDatabaseId: string;
  usDatabaseId: string;
  propertiesName: PropertiesName;
  epicFilter?: EpicFilter;
  ticketFilter?: EpicFilter;
}

export const DEFAULT_PROPERTIES_CONFIG: { propertiesName: PropertiesName; epicFilter: EpicFilter } = {
  propertiesName: {
    id: 'ID',
    title: 'Name',
    status: 'Status',
    complexity: 'Size',
    bloque: 'Bloque',
    statuses: {
      backlogToPrepare: [],
      toChallenge: [],
      toStrat: [],
      toDev: [],
      sprintBacklog: [],
      isInProgress: [],
      done: [],
      toValidate: [],
      blocked: [],
    },
    epic: 'Epic',
    epicName: 'Name',
    assignedTo: 'Assign',
  },
  epicFilter: [],
};

export type ColumnKey = keyof StatusMapping;

export interface ColumnDefinition {
  key: ColumnKey;
  displayName: string;
}

export const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: 'backlogToPrepare', displayName: 'Backlog à préparer' },
  { key: 'toChallenge', displayName: 'A challenger' },
  { key: 'toStrat', displayName: 'A strater' },
  { key: 'toDev', displayName: 'Prêt pour le dev' },
  { key: 'sprintBacklog', displayName: 'Sprint Backlog' },
  { key: 'isInProgress', displayName: 'En cours' },
  { key: 'toValidate', displayName: 'A valider' },
  { key: 'blocked', displayName: 'Bloqué' },
  { key: 'done', displayName: 'En prod' },
];

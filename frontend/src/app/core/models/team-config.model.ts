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
}

export const DEFAULT_PROPERTIES_CONFIG: { propertiesName: PropertiesName; epicFilter: EpicFilter } = {
  propertiesName: {
    id: 'ID',
    title: 'Name',
    status: 'Status',
    complexity: 'Size',
    bloque: 'Bloque',
    statuses: {
      backlogToPrepare: ['02 - Backlog à préparer'],
      toChallenge: ['1 🛹 Backlog'],
      toStrat: ['2 🛴 Strat tech'],
      toDev: ['21 - Backlog ready'],
      sprintBacklog: ['3 🛴 Sprint backlog'],
      isInProgress: ['4 🎯Daily Goals', '5 👨🏻‍💻 Doing', '61 👁️ Code review', '62 🚀 To Deploy Preprod'],
      done: ['9 🎯 Done Sprint actuel', 'Anciens Sprints'],
      toValidate: ['8 👀 A valider', '81 🚢 To Ship (Prod)'],
      blocked: ['7 🚨 Blocked'],
    },
    epic: 'Epic',
    epicName: 'Name',
    assignedTo: 'Assign',
  },
  epicFilter: [
    { property: 'Status', type: 'select', value: 'Delivery Team' },
  ],
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

import { ColumnKey } from '../models/team-config.model';

const GRIS: ColumnKey[] = ['backlogToPrepare', 'toChallenge', 'toStrat'];
const VERT: ColumnKey[] = ['done'];

export function getStatusColor(columnKey: ColumnKey | null): { bg: string; border: string } {
  if (!columnKey) return { bg: 'bg-gray-100', border: 'border-gray-300' };
  if (GRIS.includes(columnKey)) return { bg: 'bg-gray-100', border: 'border-gray-300' };
  if (VERT.includes(columnKey)) return { bg: 'bg-emerald-50', border: 'border-emerald-400' };
  return { bg: 'bg-blue-50', border: 'border-blue-400' };
}

export const LEGEND_ITEMS: { key: ColumnKey; label: string; dotClass: string }[] = [
  { key: 'backlogToPrepare', label: 'Pas encore pris', dotClass: 'bg-gray-400' },
  { key: 'isInProgress',     label: 'En cours',        dotClass: 'bg-blue-500' },
  { key: 'done',             label: 'Terminé',         dotClass: 'bg-emerald-400' },
];

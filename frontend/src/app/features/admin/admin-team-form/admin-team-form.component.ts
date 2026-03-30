import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, TeamWithToken } from '../../../core/services/admin.service';
import { TeamConfig, PropertiesName, StatusMapping, EpicFilter, COLUMN_DEFINITIONS } from '../../../core/models/team-config.model';

@Component({
  selector: 'app-admin-team-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900">
            {{ team() ? "Modifier l'équipe" : 'Nouvelle équipe' }}
          </h2>
          <button (click)="cancelled.emit()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form (ngSubmit)="save()" class="p-6 space-y-5">

          <!-- ── Section 1 : Infos générales ── -->
          <fieldset class="space-y-4">
            <legend class="text-sm font-semibold text-gray-800 uppercase tracking-wide">Informations générales</legend>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Nom de l'équipe *</label>
              <input
                type="text"
                [(ngModel)]="name"
                name="name"
                required
                class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ex: Flash, Openfinance..."
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Clé API Notion *
                @if (team()) {
                  <span class="text-xs text-gray-400 ml-1">(laisser vide pour conserver l'actuelle)</span>
                }
              </label>
              <input
                type="password"
                [(ngModel)]="notionApiToken"
                name="notionApiToken"
                [required]="!team()"
                class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ntn_xxxxxxxxxxxx"
              />
              <p class="text-xs text-gray-400 mt-1">
                Notion > Settings > Integrations > votre intégration > Internal Integration Secret
              </p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Epic Database ID *</label>
                <input
                  type="text"
                  [(ngModel)]="epicDatabaseId"
                  name="epicDatabaseId"
                  required
                  class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="xxxxxxxx-xxxx-..."
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">US Database ID *</label>
                <input
                  type="text"
                  [(ngModel)]="usDatabaseId"
                  name="usDatabaseId"
                  required
                  class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="xxxxxxxx-xxxx-..."
                />
              </div>
            </div>
            <p class="text-xs text-gray-400 -mt-2">
              Ouvrez la base Notion en page entiere, le Database ID est dans l'URL :
              notion.so/<strong>DATABASE_ID</strong>?v=...
            </p>
          </fieldset>

          <!-- ── Section 2 : Noms des propriétés Notion ── -->
          <fieldset class="space-y-3">
            <legend class="text-sm font-semibold text-gray-800 uppercase tracking-wide">
              Noms des propriétés Notion
            </legend>
            <p class="text-xs text-gray-500">
              Adaptez chaque valeur au nom exact du champ dans votre base Notion.
            </p>

            <div class="grid grid-cols-2 gap-3">
              @for (field of propertyFields; track field.key) {
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-0.5">{{ field.label }}</label>
                  <input
                    type="text"
                    [(ngModel)]="properties[field.key]"
                    [name]="'prop_' + field.key"
                    class="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    [placeholder]="field.placeholder"
                  />
                </div>
              }
            </div>
          </fieldset>

          <!-- ── Section 3 : Mapping des statuts → colonnes kanban ── -->
          <fieldset class="space-y-3">
            <legend class="text-sm font-semibold text-gray-800 uppercase tracking-wide">
              Mapping statuts Notion → colonnes kanban
            </legend>
            <p class="text-xs text-gray-500">
              Pour chaque colonne, indiquez les noms de statuts Notion correspondants, séparés par des virgules.
              Laissez vide si la colonne ne s'applique pas.
            </p>

            <div class="space-y-2">
              @for (col of columnDefinitions; track col.key) {
                <div class="flex items-start gap-3">
                  <label class="w-40 shrink-0 text-xs font-medium text-gray-600 pt-1.5">{{ col.displayName }}</label>
                  <input
                    type="text"
                    [(ngModel)]="statusMappings[col.key]"
                    [name]="'status_' + col.key"
                    class="flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ex: Backlog, A faire..."
                  />
                </div>
              }
            </div>
          </fieldset>

          <!-- ── Section 4 : Filtres Epic (optionnel) ── -->
          <fieldset class="space-y-3">
            <legend class="text-sm font-semibold text-gray-800 uppercase tracking-wide">
              Filtres sur les epics
              <span class="text-xs font-normal text-gray-400 ml-1">(optionnel)</span>
            </legend>
            <p class="text-xs text-gray-500">
              Permet de ne montrer que certaines epics. Laissez vide pour tout afficher.
            </p>

            @for (filter of epicFilters; track $index) {
              <div class="flex items-end gap-2">
                <div class="flex-1">
                  <label class="block text-xs font-medium text-gray-600 mb-0.5">Propriété</label>
                  <input
                    type="text"
                    [(ngModel)]="filter.property"
                    [name]="'filter_prop_' + $index"
                    class="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ex: Status"
                  />
                </div>
                <div class="w-36">
                  <label class="block text-xs font-medium text-gray-600 mb-0.5">Type</label>
                  <select
                    [(ngModel)]="filter.type"
                    [name]="'filter_type_' + $index"
                    class="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="select">select</option>
                    <option value="status">status</option>
                    <option value="multi_select">multi_select</option>
                  </select>
                </div>
                <div class="flex-1">
                  <label class="block text-xs font-medium text-gray-600 mb-0.5">Valeur</label>
                  <input
                    type="text"
                    [(ngModel)]="filter.value"
                    [name]="'filter_val_' + $index"
                    class="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ex: Delivery Team"
                  />
                </div>
                <button
                  type="button"
                  (click)="removeFilter($index)"
                  class="px-2 py-1.5 text-red-500 hover:text-red-700 text-sm"
                  title="Supprimer ce filtre"
                >
                  &times;
                </button>
              </div>
            }

            <button
              type="button"
              (click)="addFilter()"
              class="text-sm text-blue-600 hover:text-blue-800"
            >
              + Ajouter un filtre
            </button>
          </fieldset>

          @if (error()) {
            <p class="text-sm text-red-600">{{ error() }}</p>
          }

          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              (click)="cancelled.emit()"
              class="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              [disabled]="loading()"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {{ loading() ? 'Enregistrement...' : 'Enregistrer' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class AdminTeamFormComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly team = input<TeamWithToken | null>(null);
  readonly saved = output<TeamConfig>();
  readonly cancelled = output<void>();

  name = '';
  notionApiToken = '';
  epicDatabaseId = '';
  usDatabaseId = '';

  readonly columnDefinitions = COLUMN_DEFINITIONS;

  readonly propertyFields: { key: string; label: string; placeholder: string }[] = [
    { key: 'id', label: 'Identifiant du ticket', placeholder: 'ID' },
    { key: 'title', label: 'Titre du ticket', placeholder: 'Name' },
    { key: 'status', label: 'Statut', placeholder: 'Status' },
    { key: 'complexity', label: 'Complexité / Points', placeholder: 'Size' },
    { key: 'bloque', label: 'Relation "bloqué par"', placeholder: 'Bloque' },
    { key: 'epic', label: 'Relation vers Epic', placeholder: 'Epic' },
    { key: 'epicName', label: 'Titre dans base Epic', placeholder: 'Name' },
    { key: 'assignedTo', label: 'Assignation', placeholder: 'Assign' },
  ];

  properties: Record<string, string> = {
    id: 'ID',
    title: 'Name',
    status: 'Status',
    complexity: 'Size',
    bloque: 'Bloque',
    epic: 'Epic',
    epicName: 'Name',
    assignedTo: 'Assign',
  };

  statusMappings: Record<string, string> = {
    backlogToPrepare: '',
    toChallenge: '',
    toStrat: '',
    toDev: '',
    sprintBacklog: '',
    isInProgress: '',
    done: '',
    toValidate: '',
    blocked: '',
  };

  epicFilters: { property: string; type: 'select' | 'status' | 'multi_select'; value: string }[] = [];

  readonly loading = signal(false);
  readonly error = signal('');

  ngOnInit(): void {
    const t = this.team();
    if (t) {
      this.name = t.name;
      this.epicDatabaseId = t.epicDatabaseId;
      this.usDatabaseId = t.usDatabaseId;

      // Populate property fields
      const p = t.propertiesName;
      this.properties = {
        id: p.id,
        title: p.title,
        status: p.status,
        complexity: p.complexity,
        bloque: p.bloque,
        epic: p.epic,
        epicName: p.epicName,
        assignedTo: p.assignedTo,
      };

      // Populate status mappings (arrays → comma-separated strings)
      for (const [key, values] of Object.entries(p.statuses)) {
        this.statusMappings[key] = values.join(', ');
      }

      // Populate epic filters
      this.epicFilters = (t.epicFilter ?? []).map(f => ({ ...f }));
    }
  }

  addFilter(): void {
    this.epicFilters = [...this.epicFilters, { property: '', type: 'select', value: '' }];
  }

  removeFilter(index: number): void {
    this.epicFilters = this.epicFilters.filter((_, i) => i !== index);
  }

  save(): void {
    this.error.set('');
    this.loading.set(true);

    // Build status mappings: comma-separated strings → trimmed arrays
    const parseValues = (csv: string): string[] =>
      csv.split(',').map(s => s.trim()).filter(s => s.length > 0);

    const statuses: StatusMapping = {
      backlogToPrepare: parseValues(this.statusMappings['backlogToPrepare']),
      toChallenge: parseValues(this.statusMappings['toChallenge']),
      toStrat: parseValues(this.statusMappings['toStrat']),
      toDev: parseValues(this.statusMappings['toDev']),
      sprintBacklog: parseValues(this.statusMappings['sprintBacklog']),
      isInProgress: parseValues(this.statusMappings['isInProgress']),
      done: parseValues(this.statusMappings['done']),
      toValidate: parseValues(this.statusMappings['toValidate']),
      blocked: parseValues(this.statusMappings['blocked']),
    };

    // Build epic filter (remove empty rows)
    const epicFilter: EpicFilter = this.epicFilters.filter(f => f.property && f.value);

    const propertiesName: PropertiesName = {
      id: this.properties['id'],
      title: this.properties['title'],
      status: this.properties['status'],
      complexity: this.properties['complexity'],
      bloque: this.properties['bloque'],
      epic: this.properties['epic'],
      epicName: this.properties['epicName'],
      assignedTo: this.properties['assignedTo'],
      statuses,
    };

    const t = this.team();

    const payload = {
      name: this.name,
      notionApiToken: this.notionApiToken || undefined,
      epicDatabaseId: this.epicDatabaseId,
      usDatabaseId: this.usDatabaseId,
      propertiesName,
      epicFilter,
    };

    const request$ = t
      ? this.adminService.updateTeam({ ...payload, id: t.id } as TeamConfig & { notionApiToken?: string })
      : this.adminService.createTeam(payload as Omit<TeamConfig, 'id'> & { notionApiToken: string });

    request$.subscribe({
      next: team => this.saved.emit(team),
      error: () => {
        this.error.set('Une erreur est survenue.');
        this.loading.set(false);
      },
    });
  }
}

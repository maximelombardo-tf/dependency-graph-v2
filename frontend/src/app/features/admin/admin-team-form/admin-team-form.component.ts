import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, TeamWithToken } from '../../../core/services/admin.service';
import { TeamConfig } from '../../../core/models/team-config.model';

const DOCUMENTED_DEFAULT_JSON = `{
  // ── Noms des propriétés dans votre base Notion US ──
  // Adaptez chaque valeur au nom exact du champ dans votre base Notion.
  "propertiesName": {
    "id":         "ID",              // Champ identifiant du ticket
    "title":      "Name",            // Champ titre du ticket
    "status":     "Status",          // Champ statut (select)
    "complexity": "Size",            // Champ complexité / points
    "bloque":     "Bloque",          // Champ relation "bloqué par" (dépendances)
    "epic":       "Epic",            // Champ relation vers la base Epic
    "epicName":   "Name",            // Champ titre dans la base Epic
    "assignedTo": "Assign",          // Champ assignation (people)

    // ── Mapping des statuts Notion → colonnes du kanban ──
    // Chaque clé correspond à une colonne. La valeur est un tableau
    // des noms de statuts Notion qui vont dans cette colonne.
    // Mettez un tableau vide [] si la colonne n'existe pas pour cette équipe.
    "statuses": {
      "backlogToPrepare": ["02 - Backlog à préparer"],
      "toChallenge":      ["1 Backlog"],
      "toStrat":          ["2 Strat tech"],
      "toDev":            ["21 - Backlog ready"],
      "sprintBacklog":    ["3 Sprint backlog"],
      "isInProgress":     ["4 Daily Goals", "5 Doing", "61 Code review"],
      "done":             ["9 Done Sprint actuel"],
      "toValidate":       ["8 A valider", "81 To Ship (Prod)"],
      "blocked":          ["7 Blocked"]
    }
  },

  // ── Filtres appliqués sur la base Epic (optionnel) ──
  // Permet de ne montrer que certaines épics.
  // Types possibles : "select", "status", "multi_select"
  // Laissez un tableau vide [] pour afficher toutes les épics.
  "epicFilter": [
    { "property": "Status", "type": "select", "value": "Delivery Team" }
  ]
}`;

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

        <form (ngSubmit)="save()" class="p-6 space-y-4">
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
              Trouvable dans Notion > Settings > Integrations > votre intégration > Internal Integration Secret
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

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Configuration avancée (JSON)
            </label>
            <div class="text-xs text-gray-500 mb-2 space-y-1">
              <p>Ce JSON definit le mapping entre vos propriétés Notion et les colonnes du kanban.</p>
              <p>Les commentaires (<code>//</code>) sont autorises et seront retirés automatiquement.</p>
            </div>
            <textarea
              [(ngModel)]="advancedConfigJson"
              name="advancedConfigJson"
              rows="20"
              class="w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
            ></textarea>
            @if (jsonError()) {
              <p class="text-xs text-red-600 mt-1">JSON invalide : {{ jsonError() }}</p>
            }
          </div>

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
  advancedConfigJson = '';

  readonly loading = signal(false);
  readonly error = signal('');
  readonly jsonError = signal('');

  ngOnInit(): void {
    const t = this.team();
    if (t) {
      this.name = t.name;
      this.epicDatabaseId = t.epicDatabaseId;
      this.usDatabaseId = t.usDatabaseId;
      this.advancedConfigJson = JSON.stringify(
        { propertiesName: t.propertiesName, epicFilter: t.epicFilter ?? [] },
        null,
        2
      );
    } else {
      this.advancedConfigJson = DOCUMENTED_DEFAULT_JSON;
    }
  }

  save(): void {
    this.jsonError.set('');
    this.error.set('');

    // Strip JS-style comments before parsing JSON
    const cleaned = this.advancedConfigJson.replace(/\/\/.*$/gm, '');

    let advancedConfig: { propertiesName: unknown; epicFilter?: unknown };
    try {
      advancedConfig = JSON.parse(cleaned);
    } catch (e) {
      this.jsonError.set((e as Error).message);
      return;
    }

    this.loading.set(true);
    const t = this.team();

    const payload = {
      name: this.name,
      notionApiToken: this.notionApiToken || undefined,
      epicDatabaseId: this.epicDatabaseId,
      usDatabaseId: this.usDatabaseId,
      propertiesName: advancedConfig['propertiesName'],
      epicFilter: advancedConfig['epicFilter'],
    };

    const request$ = t
      ? this.adminService.updateTeam({ ...payload, id: t.id } as TeamConfig & { notionApiToken?: string })
      : this.adminService.createTeam(payload as Parameters<AdminService['createTeam']>[0]);

    request$.subscribe({
      next: team => this.saved.emit(team),
      error: () => {
        this.error.set('Une erreur est survenue.');
        this.loading.set(false);
      },
    });
  }
}

import { TeamConfigService } from './team-config.service';

describe('TeamConfigService', () => {
  let service: TeamConfigService;

  beforeEach(() => {
    localStorage.clear();
    service = new TeamConfigService();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should have at least one team configured', () => {
    expect(service.teams().length).toBeGreaterThan(0);
  });

  it('should start with no selection', () => {
    expect(service.selectedTeam()).toBeNull();
    expect(service.selectedEpic()).toBeNull();
    expect(service.hasSelection()).toBe(false);
  });

  it('should select a team', () => {
    const team = service.teams()[0];
    service.selectTeam(team);
    expect(service.selectedTeam()).toBe(team);
    expect(service.selectedEpic()).toBeNull();
    expect(localStorage.getItem('selectedTeamName')).toBe(team.name);
  });

  it('should select an epic', () => {
    const team = service.teams()[0];
    service.selectTeam(team);
    service.selectEpic({ id: 'epic-1', title: 'Epic One' });
    expect(service.selectedEpic()).toEqual({ id: 'epic-1', title: 'Epic One' });
    expect(service.hasSelection()).toBe(true);
  });

  it('should clear epic when team changes', () => {
    const team = service.teams()[0];
    service.selectTeam(team);
    service.selectEpic({ id: 'epic-1', title: 'Epic One' });
    service.selectTeam(team);
    expect(service.selectedEpic()).toBeNull();
  });

  it('should restore selection from localStorage', () => {
    const team = service.teams()[0];
    localStorage.setItem('selectedTeamName', team.name);
    localStorage.setItem('selectedEpicId', 'epic-1');
    localStorage.setItem('selectedEpicTitle', 'Epic One');

    service.restoreSelection();
    expect(service.selectedTeam()?.name).toBe(team.name);
    expect(service.selectedEpic()).toEqual({ id: 'epic-1', title: 'Epic One' });
  });

  it('should resolve column key for a status', () => {
    const team = service.teams()[0];
    service.selectTeam(team);
    const key = service.getColumnKeyForStatus('7 🚨 Blocked');
    expect(key).toBe('blocked');
  });

  it('should return null for unknown status', () => {
    const team = service.teams()[0];
    service.selectTeam(team);
    expect(service.getColumnKeyForStatus('Unknown Status')).toBeNull();
  });

  it('should get first status for column', () => {
    const team = service.teams()[0];
    service.selectTeam(team);
    const status = service.getFirstStatusForColumn('blocked');
    expect(status).toBe('7 🚨 Blocked');
  });
});

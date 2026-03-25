import { DependencyService } from './dependency.service';
import { Ticket } from '../models/ticket.model';

describe('DependencyService', () => {
  let service: DependencyService;

  beforeEach(() => {
    service = new DependencyService();
  });

  describe('buildDependenciesFromTickets', () => {
    it('should extract dependencies between tickets', () => {
      const tickets: Ticket[] = [
        { id: '1', notionId: 'a', title: 'T1', status: '', assignee: null, complexity: null, dependencyIds: ['b'], notionUrl: '' },
        { id: '2', notionId: 'b', title: 'T2', status: '', assignee: null, complexity: null, dependencyIds: [], notionUrl: '' },
        { id: '3', notionId: 'c', title: 'T3', status: '', assignee: null, complexity: null, dependencyIds: ['a', 'b'], notionUrl: '' },
      ];

      const deps = service.buildDependenciesFromTickets(tickets);

      expect(deps).toHaveLength(3);
      expect(deps).toContainEqual({ fromTicketId: 'a', toTicketId: 'b' });
      expect(deps).toContainEqual({ fromTicketId: 'c', toTicketId: 'a' });
      expect(deps).toContainEqual({ fromTicketId: 'c', toTicketId: 'b' });
    });

    it('should ignore dependencies to tickets not in the list', () => {
      const tickets: Ticket[] = [
        { id: '1', notionId: 'a', title: 'T1', status: '', assignee: null, complexity: null, dependencyIds: ['z'], notionUrl: '' },
      ];

      const deps = service.buildDependenciesFromTickets(tickets);
      expect(deps).toHaveLength(0);
    });

    it('should handle empty ticket list', () => {
      const deps = service.buildDependenciesFromTickets([]);
      expect(deps).toHaveLength(0);
    });
  });

  describe('link mode', () => {
    it('should start and cancel link mode', () => {
      expect(service.isLinkMode()).toBe(false);

      service.startLink('ticket-1', 'right');
      expect(service.isLinkMode()).toBe(true);
      expect(service.linkSource()).toEqual({ ticketId: 'ticket-1', side: 'right' });

      service.cancelLink();
      expect(service.isLinkMode()).toBe(false);
      expect(service.linkSource()).toBeNull();
    });
  });

  describe('addDependency / removeDependency', () => {
    it('should add a dependency', () => {
      service.addDependency('a', 'b');
      expect(service.dependencies()).toEqual([{ fromTicketId: 'a', toTicketId: 'b' }]);
    });

    it('should not add duplicate dependency', () => {
      service.addDependency('a', 'b');
      service.addDependency('a', 'b');
      expect(service.dependencies()).toHaveLength(1);
    });

    it('should not add self-dependency', () => {
      service.addDependency('a', 'a');
      expect(service.dependencies()).toHaveLength(0);
    });

    it('should remove a dependency', () => {
      service.addDependency('a', 'b');
      service.addDependency('a', 'c');
      service.removeDependency('a', 'b');
      expect(service.dependencies()).toEqual([{ fromTicketId: 'a', toTicketId: 'c' }]);
    });
  });

  describe('buildBezierPath (via computeArrowPaths)', () => {
    it('should generate valid SVG path', () => {
      // Test indirectly via the private method by checking the path format
      const tickets: Ticket[] = [
        { id: '1', notionId: 'a', title: 'T1', status: '', assignee: null, complexity: null, dependencyIds: ['b'], notionUrl: '' },
        { id: '2', notionId: 'b', title: 'T2', status: '', assignee: null, complexity: null, dependencyIds: [], notionUrl: '' },
      ];
      service.buildDependenciesFromTickets(tickets);

      // Create mock elements
      const container = document.createElement('div');
      Object.defineProperty(container, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }),
      });
      Object.defineProperty(container, 'scrollLeft', { value: 0 });
      Object.defineProperty(container, 'scrollTop', { value: 0 });

      const el1 = document.createElement('div');
      Object.defineProperty(el1, 'getBoundingClientRect', {
        value: () => ({ left: 100, top: 100, right: 200, bottom: 150, width: 100, height: 50 }),
      });

      const el2 = document.createElement('div');
      Object.defineProperty(el2, 'getBoundingClientRect', {
        value: () => ({ left: 400, top: 200, right: 500, bottom: 250, width: 100, height: 50 }),
      });

      const elements = new Map<string, HTMLElement>([['a', el1], ['b', el2]]);
      const paths = service.computeArrowPaths(service.dependencies(), elements, container);

      expect(paths).toHaveLength(1);
      expect(paths[0].path).toMatch(/^M \d+ \d+ C \d+ \d+, \d+ \d+, \d+ \d+$/);
      expect(paths[0].fromTicketId).toBe('a');
      expect(paths[0].toTicketId).toBe('b');
    });
  });
});

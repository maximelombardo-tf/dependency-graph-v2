import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    service = new ToastService();
  });

  it('should add a toast', () => {
    service.show('Hello', 'info', 0);
    expect(service.toasts()).toHaveLength(1);
    expect(service.toasts()[0].message).toBe('Hello');
    expect(service.toasts()[0].type).toBe('info');
  });

  it('should add error toast', () => {
    service.error('Error occurred');
    expect(service.toasts()).toHaveLength(1);
    expect(service.toasts()[0].type).toBe('error');
  });

  it('should add success toast', () => {
    service.success('Done!');
    expect(service.toasts()).toHaveLength(1);
    expect(service.toasts()[0].type).toBe('success');
  });

  it('should dismiss a toast', () => {
    service.show('Test', 'info', 0);
    const id = service.toasts()[0].id;
    service.dismiss(id);
    expect(service.toasts()).toHaveLength(0);
  });

  it('should handle multiple toasts', () => {
    service.show('One', 'info', 0);
    service.show('Two', 'error', 0);
    service.show('Three', 'success', 0);
    expect(service.toasts()).toHaveLength(3);
  });
});

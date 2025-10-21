import { EventEmitter } from 'events';
import { LogService } from './logService';

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor(private readonly logger: LogService) {}

  emit(event: string, payload: unknown): void {
    this.logger.debug(`event::${event}`, 'event-bus');
    this.emitter.emit(event, payload);
  }

  on(event: string, handler: (payload: unknown) => void): void {
    this.emitter.on(event, handler);
  }
}

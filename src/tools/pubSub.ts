export enum EVENT_TYPE {
  ADD = 'ADD',
  CONSOLE = 'CONSOLE',
  RUN = 'Run',
}
class PubSub<T> {
  _value: T;
  // @ts-ignore
  subcribers: { [key in EVENT_TYPE]: Function[] } = {};

  constructor(value: T) {
    this._value = value;
  }

  get value() {
    return this._value;
  }

  subscribe = (event: EVENT_TYPE, cb: Function) => {
    if (!this.subcribers[event]) {
      this.subcribers[event] = [];
    }
    this.subcribers[event].push(cb);
  }

  unSubscribe = (event: EVENT_TYPE, cb: Function) => {
    if (this.subcribers[event]) {
      this.subcribers[event] = this.subcribers[event].filter((subCb: Function) => subCb !== cb);
    }
  }

  publish = (event: EVENT_TYPE, data: any, isCallback: boolean) => {
    if (data !== null) {
      this._value = data;
    }
    if (!isCallback) return;
    if (this.subcribers[event]) {
      this.subcribers[event].forEach(cb => cb(this._value));
    }
  }
}

export default PubSub;
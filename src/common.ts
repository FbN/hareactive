import { Behavior } from "./behavior";

export type Time = number;

function isBehavior(b: any): b is Behavior<any> {
  return typeof b === "object" && ("at" in b);
}

export const enum State {
  // Values are pushed to listeners
  Push,
  // Values should be pulled by listeners
  Pull,
  // Values should be pulled and the reactive will _never_ switch
  // state to `Push`
  OnlyPull,
  // Most, but not all, reactives start in this state
  Inactive
}

export interface Observer<A> {
  push(a: A): void;
  changeStateDown(state: State): void;
}

export class PushOnlyObserver<A> {
  constructor(private callback: (a: A) => void, private source: Reactive<A>) {
    source.addListener(this);
    if (isBehavior(source) && source.state === State.Push) {
      callback(source.at());
    }
  }
  push(a: any): void {
    this.callback(a);
  }
  deactivate(): void {
    this.source.removeListener(this);
  }
  changeStateDown(state: State): void { }
}

export class MultiObserver<A> implements Observer<A> {
  listeners: Observer<A>[];
  constructor(c1: Observer<A>, c2: Observer<A>) {
    this.listeners = [c1, c2];
  }
  push(a: A): void {
    for (let i = 0; i < this.listeners.length; ++i) {
      this.listeners[i].push(a);
    }
  }
  changeStateDown(state: State): void {
    for (let i = 0; i < this.listeners.length; ++i) {
      this.listeners[i].changeStateDown(state);
    }
  }
}

export interface Subscriber<A> extends Observer<A> {
  deactivate(): void;
}

export abstract class Reactive<A> implements Observer<any> {
  child: Observer<A>;
  nrOfListeners: number;
  state: State;
  constructor() {
    this.state = State.Inactive;
    this.nrOfListeners = 0;
  }
  addListener(c: Observer<A>): State {
    const nr = ++this.nrOfListeners;
    if (nr === 1) {
      this.child = c;
      this.activate();
    } else if (nr === 2) {
      this.child = new MultiObserver(this.child, c);
    } else {
      (<MultiObserver<A>>this.child).listeners.push(c);
    }
    return this.state;
  }
  removeListener(listener: Observer<any>): void {
    const nr = --this.nrOfListeners;
    if (nr === 0) {
      this.child = undefined;
      this.deactivate();
    } else if (nr === 1) {
      const l = (<MultiObserver<A>>this.child).listeners;
      this.child = l[l[0] === listener ? 1 : 0];
    } else {
      const l = (<MultiObserver<A>>this.child).listeners;
      // The indexOf here is O(n), where n is the number of listeners,
      // if using a linked list it should be possible to perform the
      // unsubscribe operation in constant time.
      const idx = l.indexOf(listener);
      if (idx !== -1) {
        if (idx !== l.length - 1) {
          l[idx] = l[l.length - 1];
        }
        l.length--; // remove the last element of the list
      }
    }
  }
  changeStateDown(state: State): void {
    if (this.child !== undefined) {
      this.child.changeStateDown(state);
    }
  }
  subscribe(callback: (a: A) => void): Subscriber<A> {
    return new PushOnlyObserver(callback, this);
  }
  observe(
    push: (a: A) => void,
    beginPulling: () => void,
    endPulling: () => void
  ): CbObserver<A> {
    return new CbObserver(push, beginPulling, endPulling, this);
  }
  abstract push(a: any): void;
  abstract deactivate(): void;
  abstract activate(): void;
  abstract map<B>(f: (a: A) => B): Reactive<B>;
}

export class CbObserver<A> implements Observer<A> {
  constructor(
    private _push: (a: A) => void,
    private _beginPulling: () => void,
    private _endPulling: () => void,
    private source: Reactive<A>
  ) {
    source.addListener(this);
    if (source.state === State.Pull || source.state === State.OnlyPull) {
      _beginPulling();
    } else if (isBehavior(source) && source.state === State.Push) {
      _push(source.last);
    }
  }
  push(a: A): void {
    this._push(a);
  }
  changeStateDown(state: State): void {
    if (state === State.Pull || state === State.OnlyPull) {
      this._beginPulling();
    } else {
      this._endPulling();
    }
  }
}

/**
 * Observe a behavior for the purpose of executing imperative actions
 * based on the value of the behavior.
 */
export function observe<A>(
  push: (a: A) => void,
  beginPulling: () => void,
  endPulling: () => void,
  b: Reactive<A>
): CbObserver<A> {
  return b.observe(push, beginPulling, endPulling);
}

import { monad, Semigroup } from "@funkia/jabz";
import { State, SListener, Parent, BListener, Time } from "./common";
import { Reactive } from "./common";
import { cons, fromArray, Node } from "./datastructures";
import { Behavior, FunctionBehavior } from "./behavior";
import { tick } from "./clock";
import { Stream, Occurrence } from "./stream";

export type MapFutureTuple<A> = { [K in keyof A]: Future<A[K]> };

export function doesOccur<A>(
  future: SemanticFuture<A>
): future is Occurrence<A> {
  return future.time !== "infinity";
}

export const neverOccurringFuture = {
  time: "infinity" as "infinity",
  value: undefined as undefined
};

export type SemanticFuture<A> = Occurrence<A> | typeof neverOccurringFuture;

/**
 * A future is a thing that occurs at some point in time with a value.
 * It can be understood as a pair consisting of the time the future
 * occurs and its associated value. It is quite like a JavaScript
 * promise.
 */
@monad
export abstract class Future<A> extends Reactive<A, SListener<A>>
  implements Semigroup<Future<A>>, Parent<SListener<any>> {
  // The value of the future. Often `undefined` until occurrence.
  value: A;
  constructor() {
    super();
  }
  abstract pushS(t: number, val: any): void;
  pull(): A {
    throw new Error("Pull not implemented on future");
  }
  resolve(val: A, t: Time = tick()): void {
    this.deactivate(true);
    this.value = val;
    this.pushSToChildren(t, val);
  }
  pushSToChildren(t: number, val: A): void {
    for (const child of this.children) {
      child.pushS(t, val);
    }
  }
  addListener(node: Node<SListener<A>>, t: number): State {
    if (this.state === State.Done) {
      node.value.pushS(t, this.value);
      return State.Done;
    } else {
      return super.addListener(node, t);
    }
  }
  combine(future: Future<A>): Future<A> {
    return new CombineFuture(this, future);
  }
  // A future is a functor, when the future occurs we can feed its
  // result through the mapping function
  map<B>(f: (a: A) => B): Future<B> {
    return new MapFuture(f, this);
  }
  mapTo<B>(b: B): Future<B> {
    return new MapToFuture<B>(b, this);
  }
  abstract semantic(): SemanticFuture<A>;
  // A future is an applicative. `of` gives a future that has always
  // occurred at all points in time.
  static of<B>(b: B): Future<B> {
    return new OfFuture(b);
  }
  of<B>(b: B): Future<B> {
    return new OfFuture(b);
  }
  ap: <B>(f: Future<(a: A) => B>) => Future<B>;
  lift<A extends any[], R>(
    f: (...args: A) => R,
    ...args: MapFutureTuple<A>
  ): Future<R> {
    return args.length === 1
      ? new MapFuture(f as any, args[0])
      : new LiftFuture(f, args);
  }
  static multi: false;
  multi: false = false;
  // A future is a monad. Once the first future occurs `flatMap` passes its
  // value through the function and the future it returns is the one returned by
  // `flatMap`.
  flatMap<B>(f: (a: A) => Future<B>): Future<B> {
    return new FlatMapFuture(f, this);
  }
  chain<B>(f: (a: A) => Future<B>): Future<B> {
    return new FlatMapFuture(f, this);
  }
  flatten: <B>() => Future<B>;
}

export function isFuture(a: any): a is Future<any> {
  return typeof a === "object" && "resolve" in a;
}

class CombineFuture<A> extends Future<A> {
  constructor(private future1: Future<A>, private future2: Future<A>) {
    super();
    this.parents = cons(future1, cons(future2));
  }
  pushS(t: number, val: A): void {
    this.resolve(val, t);
  }
  semantic(): SemanticFuture<A> {
    const a = this.future1.semantic();
    const b = this.future2.semantic();
    return a.time <= b.time ? a : b;
  }
}

class MapFuture<A, B> extends Future<B> {
  constructor(private f: (a: A) => B, private parent: Future<A>) {
    super();
    this.parents = cons(parent);
  }
  pushS(t: number, val: A): void {
    this.resolve(this.f(val), t);
  }
  semantic(): SemanticFuture<B> {
    const p = this.parent.semantic();
    return doesOccur(p)
      ? { time: p.time, value: this.f(p.value) }
      : neverOccurringFuture;
  }
}

class MapToFuture<A> extends Future<A> {
  constructor(public value: A, private parent: Future<any>) {
    super();
    this.parents = cons(parent);
  }
  pushS(t: any, _val: any): void {
    this.resolve(this.value, t);
  }
  semantic(): SemanticFuture<A> {
    const p = this.parent.semantic();
    return doesOccur(p)
      ? { time: p.time, value: this.value }
      : neverOccurringFuture;
  }
}

class OfFuture<A> extends Future<A> {
  constructor(public value: A) {
    super();
    this.state = State.Done;
  }
  /* istanbul ignore next */
  pushS(_: any): void {
    throw new Error("A PureFuture should never be pushed to.");
  }
  semantic(): SemanticFuture<A> {
    return { time: -Infinity, value: this.value };
  }
}

class NeverFuture extends Future<any> {
  constructor() {
    super();
    this.state = State.Done;
  }
  /* istanbul ignore next */
  pushS(_: any): void {
    throw new Error("A NeverFuture should never be pushed to.");
  }
  semantic(): SemanticFuture<any> {
    return neverOccurringFuture;
  }
}

export const never = new NeverFuture();

/** For stateful futures that are always active */
export abstract class ActiveFuture<A> extends Future<A> {
  constructor() {
    super();
    this.state = State.Push;
  }
  activate(): void {}
}

class LiftFuture<A> extends Future<A> {
  private missing: number;
  constructor(private f: Function, private futures: Future<any>[]) {
    super();
    this.missing = futures.length;
    this.parents = fromArray(futures);
  }
  pushS(t: number, _val: any): void {
    if (--this.missing === 0) {
      // All the dependencies have occurred.
      for (let i = 0; i < this.futures.length; ++i) {
        this.futures[i] = this.futures[i].value;
      }
      this.resolve(this.f.apply(undefined, this.futures), t);
    }
  }
  semantic(): SemanticFuture<A> {
    const sems = this.futures.map((f) => f.semantic());
    const time = Math.max(
      ...sems.map((s) => (doesOccur(s) ? s.time : Infinity))
    );
    return time !== Infinity
      ? { time, value: this.f(...sems.map((s) => s.value)) }
      : neverOccurringFuture;
  }
}

class FlatMapFuture<A, B> extends Future<B> implements SListener<A> {
  private parentOccurred: boolean = false;
  private node: Node<this> = new Node(this);
  constructor(private f: (a: A) => Future<B>, private parent: Future<A>) {
    super();
    this.parents = cons(parent);
  }
  pushS(t: number, val: any): void {
    if (this.parentOccurred === false) {
      // The first future occurred. We can now call `f` with its value
      // and listen to the future it returns.
      this.parentOccurred = true;
      const newFuture = this.f(val);
      newFuture.addListener(this.node, t);
    } else {
      this.resolve(val, t);
    }
  }
  semantic(): SemanticFuture<B> {
    const a = this.parent.semantic();
    if (doesOccur(a)) {
      const b = this.f(a.value).semantic();
      if (doesOccur(b)) {
        return { time: Math.max(a.time, b.time), value: b.value };
      }
    }
    return neverOccurringFuture;
  }
}

/**
 * A Sink is a producer that one can imperatively resolve.
 * @private
 */
export class SinkFuture<A> extends ActiveFuture<A> {
  /* istanbul ignore next */
  pushS(t: number, val: any): void {
    throw new Error("A sink should not be pushed to.");
  }
  semantic(): never {
    throw new Error("The SinkFuture does not have a semantic representation");
  }
}

export function sinkFuture<A>(): Future<A> {
  return new SinkFuture<A>();
}

export function fromPromise<A>(promise: Promise<A>): Future<A> {
  const future = sinkFuture<A>();
  promise.then(future.resolve.bind(future));
  return future;
}

export function toPromise<A>(future: Future<A>): Promise<A> {
  return new Promise((resolve, _reject) => {
    future.subscribe(resolve);
  });
}

/**
 * Create a future from a pushing behavior. The future occurs when the
 * behavior pushes its next value. Constructing a BehaviorFuture is
 * impure and should not be done directly.
 * @private
 */
export class BehaviorFuture<A> extends SinkFuture<A> implements BListener {
  node: Node<this> = new Node(this);
  constructor(private b: Behavior<A>) {
    super();
    b.addListener(this.node, tick());
  }
  /* istanbul ignore next */
  changeStateDown(_state: State): void {
    throw new Error("Behavior future does not support pulling behavior");
  }
  pushB(t: number): void {
    this.b.removeListener(this.node);
    this.resolve(this.b.last, t);
  }
}

class NextOccurenceFuture<A> extends Future<A> implements SListener<A> {
  constructor(private s: Stream<A>, private time: Time) {
    super();
    this.parents = cons(s);
  }
  pushS(t: number, val: any): void {
    this.resolve(val, t);
  }
  semantic(): SemanticFuture<A> {
    const occ = this.s.semantic().find((o) => o.time > this.time);
    return occ !== undefined ? occ : neverOccurringFuture;
  }
}

export function nextOccurence<A>(stream: Stream<A>): Behavior<Future<A>> {
  return new FunctionBehavior((t: Time) => new NextOccurenceFuture(stream, t));
}

class MapCbFuture<A, B> extends ActiveFuture<B> {
  node: Node<this> = new Node(this);
  doneCb = (result: B): void => this.resolve(result);
  constructor(
    private cb: (value: A, done: (result: B) => void) => void,
    parent: Future<A>
  ) {
    super();
    this.parents = cons(parent);
    parent.addListener(this.node, tick());
  }
  pushS(_: number, value: A): void {
    this.cb(value, this.doneCb);
  }
  semantic(): never {
    throw new Error(
      "The BehaviorFuture does not have a semantic representation"
    );
  }
}

/**
 * Invokes the callback when the future occurs.
 *
 * This function is intended to be a low-level function used as the
 * basis for other operators.
 */
export function mapCbFuture<A, B>(
  cb: (value: A, done: (result: B) => void) => void,
  future: Future<A>
): Future<B> {
  return new MapCbFuture(cb, future);
}

class TestFuture<A> extends Future<A> {
  constructor(private time: number, public value: A) {
    super();
  }
  /* istanbul ignore next */
  pushS(_: any): void {
    throw new Error("A test pure should never be pushed to.");
  }
  semantic(): SemanticFuture<A> {
    return { time: this.time, value: this.value };
  }
}

export function testFuture<A>(time: number, value: A): Future<A> {
  return new TestFuture(time, value);
}

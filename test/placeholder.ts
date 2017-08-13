import { subscribeSpy } from "./helpers";
import { spy, useFakeTimers } from "sinon";
import { assert } from "chai";

import { placeholder } from "../src/placeholder";
import { State, observe } from "../src/common";
import {
  isBehavior, Behavior, stepper, fromFunction, sinkBehavior, ap, map,
  publish, apply, debounce, delay, empty, filter, filterApply,
  isStream, keepWhen, ProducerStream, scanS, sinkStream, snapshot,
  snapshotWith, split, Stream, subscribe, testStreamFromArray,
  testStreamFromObject, throttle
} from "../src/index";

import { createTestProducerBehavior } from "./helpers";

describe("placeholder", () => {
  describe("behavior", () => {
    it("subscribers are notified when placeholder is replaced", () => {
      let result: number;
      const p = placeholder<string>();
      const mapped = p.map((s) => s.length);
      mapped.subscribe((n: number) => result = n);
      p.replaceWith(sinkBehavior("Hello"));
      assert.strictEqual(result, 5);
    });
    it("observer are notified when replaced with pulling behavior", () => {
      let beginPulling = false;
      const p = placeholder();
      const b = fromFunction(() => 12);
      observe(
        () => { throw new Error("should not be called"); },
        () => {
          beginPulling = true;
          return () => { throw new Error("should not be called"); };
        },
        p
      );
      assert.strictEqual(beginPulling, false);
      p.replaceWith(b);
      assert.strictEqual(beginPulling, true);
      assert.strictEqual(p.at(), 12);
    });
    it("pushes if replaced with pushing behavior", () => {
      const stream = sinkStream();
      const b = stepper(0, stream).at();
      const p = placeholder();
      // We replace with a behavior that does not support pulling
      p.replaceWith(b);
      assert.strictEqual(p.at(), 0);
    });
    it("is a behavior", () => {
      const p = placeholder();
      assert.strictEqual(isBehavior(p), true);
    });
    it("throws on attempt to sample non-replaced behavior", () => {
      const p = placeholder();
      assert.throws(() => {
        p.at();
      }, "placeholder");
    });
    it("mapTo", () => {
      const p = placeholder<number>();
      const mapped = p.mapTo(12);
      assert.isTrue(isBehavior(mapped));
      assert.isTrue(isBehavior(mapped.mapTo(3)));
      const cb = subscribeSpy(mapped);
      p.replaceWith(sinkBehavior(0));
      assert.deepEqual(cb.args, [[12]]);
    });
    it("ap works on placeholder", () => {
      const b = placeholder<(a: number) => {}>();
      const applied = ap(b, Behavior.of(12));
    });
    it("chain works on placeholder", () => {
      const b = placeholder();
      const chained = b.chain((n: any) => Behavior.of(n));
      b.replaceWith(Behavior.of(3));
    });
    it("should work with consumers that only wants to pull", () => {
      const { activate, push, producer } = createTestProducerBehavior(0);
      const pB = placeholder();
      const s = sinkStream<string>();
      const shot = snapshot(pB, s);
      const callback = subscribeSpy(shot);
      pB.replaceWith(producer);
      assert.isTrue(activate.calledOnce);
      publish("a", s);
      publish("b", s);
      push(1);
      publish("c", s);
      publish("d", s);
      push(4);
      publish("e", s);
      assert.deepEqual(callback.args, [
        [0], [0], [1], [1], [4]
      ]);
    });
    it("adds puller to the behavior it has been replaced with", () => {
      const { activate, push, producer } = createTestProducerBehavior(0);
      const pB = placeholder();
      const s = sinkStream<string>();
      pB.replaceWith(producer);
      const shot = snapshot(pB, s);
      const callback = subscribeSpy(shot);
      assert.isTrue(activate.calledOnce);
    });
  });
  describe("stream", () => {
    it("is stream", () => {
      assert.isTrue(isStream(placeholder()));
    });
    it("returns stream from map", () => {
      const p = placeholder<number>();
      const mapped = p.map((n) => n * n);
      assert.isTrue(isStream(mapped));
    });
    it("map", () => {
      let result = 0;
      const p = placeholder();
      const mapped = p.map((s: number) => s + 1);
      mapped.subscribe((n: number) => result = n);
      const s = sinkStream();
      p.replaceWith(s);
      assert.strictEqual(result, 0);
      s.push(1);
      assert.strictEqual(result, 2);
    });
    it("mapTo", () => {
      const sink = sinkStream<number>();
      const p = placeholder<number>();
      const mapped = p.mapTo(12);
      assert.isTrue(isStream(mapped));
      const cb = subscribeSpy(mapped);
      p.replaceWith(sink);
      assert.deepEqual(cb.args, []);
      sink.push(12);
      sink.push(12);
      assert.deepEqual(cb.args, [[12], [12]]);
    });
    it("snapshot", () => {
      let result = 0;
      const b = Behavior.of(7);
      const p = placeholder();
      const snap = snapshot(b, p);
      snap.subscribe((n: number) => result = n);
      const s = sinkStream();
      p.replaceWith(s);
      assert.strictEqual(result, 0);
      s.push(1);
      assert.strictEqual(result, 7);
    });
    describe("timing operators", () => {
      let clock: any;
      beforeEach(() => {
        clock = useFakeTimers();
      });
      afterEach(() => {
        clock.restore();
      });
      it("delay work with placeholder", () => {
        let n = 0;
        const p = placeholder();
        const delayedP = delay(50, p);
        delayedP.subscribe(() => n = 2);
        p.subscribe(() => n = 1);
        const s = sinkStream<number>();
        p.replaceWith(s);
        s.push(0);
        assert.strictEqual(n, 1);
        clock.tick(49);
        assert.strictEqual(n, 1);
        clock.tick(1);
        assert.strictEqual(n, 2);
        clock.restore();
      });
      it("throttle", () => {
        let n = 0;
        const p = placeholder();
        const throttleP = throttle(100, p);
        throttleP.subscribe((v: number) => n = v);
        assert.strictEqual(n, 0);
        const s = sinkStream<number>();
        p.replaceWith(s);
        s.push(1);
        clock.tick(99);
        s.push(2);
        assert.strictEqual(n, 1);
        clock.tick(1);
        s.push(3);
        assert.strictEqual(n, 3);
      });
      it("should work with placeholder", () => {
        let n = 0;
        const p = placeholder();
        const debouncedP = debounce(100, p);
        debouncedP.subscribe((v: number) => n = v);
        const s = sinkStream<number>();
        p.replaceWith(s);
        assert.strictEqual(n, 0);
        s.push(1);
        clock.tick(80);
        assert.strictEqual(n, 0);
        clock.tick(30);
        assert.strictEqual(n, 1);
        s.push(2);
        assert.strictEqual(n, 1);
        clock.tick(99);
        assert.strictEqual(n, 1);
        clock.tick(2);
        assert.strictEqual(n, 2);
      });
    });
  });
});

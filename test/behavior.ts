// import { scanCombine } from "../src/behavior";
import "mocha";
import { assert } from "chai";
import { spy, useFakeTimers } from "sinon";
import { go, lift, map, mapTo } from "@funkia/jabz";
import {
  // testBehavior, 
  at, Behavior, //fromFunction, Future, integrate,
  isBehavior, //observe, placeholder, ProducerBehavior, testStreamFromObject,
  producerBehavior, //publish, 
  // scan, 
  sinkBehavior//, sinkStream, 
  // stepper, switcher, 
//  switchStream, 
  // switchTo, 
//  time, timeFrom, 
  // toggle, 
 // snapshot, empty,
  // moment
} from "../src";

import * as B from "../src/behavior";
import * as F from "../src/future";

import { subscribeSpy } from "./helpers";

function double(n: number): number {
  return n * 2;
}

function sum(n: number, m: number): number {
  return n + m;
}

const add = (a: number) => (b: number) => a + b;

function mockNow(): [(t: number) => void, () => void] {
  const orig = Date.now;
  let time = 0;
  Date.now = () => time;
  return [
    (t: number) => time = t,
    () => Date.now = orig
  ];
}

describe("behavior", () => {
  describe("isBehavior", () => {
    it("should be true when Behavior object", () => {
      assert.isTrue(isBehavior(Behavior.of(2)));
    });
    it("should be false when not Behavior object", () => {
      assert.isFalse(isBehavior([]));
      assert.isFalse(isBehavior({}));
      assert.isFalse(isBehavior(undefined));
      assert.isFalse(isBehavior("test"));
      assert.isFalse(isBehavior([Behavior.of(42)]));
      assert.isFalse(isBehavior(1234));
      assert.isFalse(isBehavior(B.isBehavior));
      // A stream is not a behavior
      //assert.isFalse(isBehavior(sinkStream()));
      assert.isFalse(Behavior.is(1));
    });
  });
  // describe("producer", () => {
  //   it("activates and deactivates", () => {
  //     const activate = spy();
  //     const deactivate = spy();
  //     class MyProducer<A> extends ProducerBehavior<A> {
  //       activateProducer(): void {
  //         activate();
  //       }
  //       deactivateProducer(): void {
  //         deactivate();
  //       }
  //     }
  //     const producer = new MyProducer();
  //     const observer = producer.subscribe((a) => a);
  //     observer.deactivate();
  //     assert(activate.calledOnce);
  //     assert(deactivate.calledOnce);
  //   });
  // });
  // describe("producerBehavior", () => {
  //   it("activates and deactivates", () => {
  //     const activate = spy();
  //     const deactivate = spy();
  //     const producer = producerBehavior((push) => {
  //       activate();
  //       return deactivate;
  //     }, "");
  //     const observer = producer.subscribe((a) => a);
  //     observer.deactivate();
  //     assert.isOk(activate.calledOnce, "activate was not called once");
  //     assert.isOk(deactivate.calledOnce, "deactivate was not called once");
  //   });
  // });
  describe("fromFunction", () => {
    it("pulls from time varying functions", () => {
      let time = 0;
      const b = B.fromFunction(() => time);
      //b.observe((v) => {}, () => () => {});
      assert.equal(B.at(b), 0);
      time = 1;
      assert.equal(B.at(b), 1);
      time = 2;
      assert.equal(B.at(b), 2);
      time = 3;
      assert.equal(B.at(b), 3);
    });
  });
  describe("functor:", () => {
    describe("map -", () => {
      it("maps over initial value from parent", () => {
        const b = B.Behavior.of(3);
        const mapped = map(double, b);
        const cb = spy();
        mapped.subscribe(cb);
        assert.deepEqual(cb.args, [[6]]);
      });
      it("maps constant function", () => {
        const b = B.sinkBehavior(1);
        const mapped = map(double, b);
        const cb = spy();
        mapped.observe(cb, () => () => {});
        b.publish(2);
        b.publish(3);
        b.publish(4);
        assert.deepEqual(cb.args, [[2], [4], [6], [8]]);
      });
      it("maps time function", () => {
        const cb = spy();
        let time = 0;
        const b = B.fromFunction(() => {
          return time;
        });
        const mapped = map(double, b);
        let pull;
        mapped.observe(cb, (p) => { pull = p; });
        pull(1);
        time = 1;
        pull(2);
        time = 2;
        pull(3);
        time = 3;
        pull(4);
        assert.deepEqual(cb.args, [[0], [2], [4], [6]]);
      });
  
      // it("has semantic representation", () => {
      //   const b = testBehavior((t) => t);
      //   const mapped = b.map((t) => t * t);
      //   const semantic = mapped.semantic();
      //   assert.strictEqual(semantic(1), 1);
      //   assert.strictEqual(semantic(2), 4);
      //   assert.strictEqual(semantic(3), 9);
      // });
    });
    describe("mapTo", () => {
      it("maps to constant", () => {
        const b = Behavior.of(1);
        const b2 = mapTo(2, b);
        assert.strictEqual(at(b2), 2);
      });
      // it("has semantic representation", () => {
      //   const b = testBehavior((t) => { throw new Error("Don't call me"); });
      //   const mapped = b.mapTo(7);
      //   const semantic = mapped.semantic();
      //   assert.strictEqual(semantic(-3), 7);
      //   assert.strictEqual(semantic(4), 7);
      //   assert.strictEqual(semantic(9), 7);
      // });
    });
    });
  describe("applicative", () => {
    it("returns a constant behavior from of", () => {
      const b1 = Behavior.of(1);
      const b2 = b1.of(2);
      assert.strictEqual(at(b1), 1);
      assert.strictEqual(at(b2), 2);
    });
    describe("ap", () => {
      it("applies event of functions to event of numbers with publish", () => {
        const fnB = sinkBehavior(add(1));
        const numE = sinkBehavior(3);
        const applied = B.ap(fnB, numE);
        const spy = subscribeSpy(applied);
        assert.equal(B.at(applied), 4);
        fnB.publish(add(2));
        assert.equal(B.at(applied), 5);
        numE.publish(4);
        assert.equal(B.at(applied), 6);
        fnB.publish(double);
        assert.equal(B.at(applied), 8);
        assert.deepEqual(spy.args, [[4], [5], [6], [8]]);
      });
      it("applies event of functions to event of numbers with pull", () => {
        let n = 1;
        let fn = add(5);
        const fnB = B.fromFunction(() => fn);
        const numB = B.fromFunction(() => n);
        const applied = B.ap(fnB, numB);
        applied.observe(v => {}, (p) => () => {});
        assert.equal(B.at(applied), 6);
        fn = add(2);
        assert.equal(B.at(applied), 3);
        n = 4;
        assert.equal(B.at(applied), 6);
        fn = double;
        assert.equal(B.at(applied), 8);
        n = 8;
        assert.equal(B.at(applied), 16);
      });
//       it("applies pushed event of functions to pulled event of numbers", () => {
//         let n = 1;
//         const fnB = sinkBehavior(add(5));
//         const numE = B.fromFunction(() => {
//           return n;
//         });
//         const applied = B.ap(fnB, numE);
//         applied.observe((v) => {}, () => () => {});
//         assert.equal(B.at(applied), 6);
//         fnB.push(add(2));
//         assert.equal(B.at(applied), 3);
//         n = 4;
//         assert.equal(B.at(applied), 6);
//         fnB.push(double);
//         assert.equal(B.at(applied), 8);
//         n = 8;
//         assert.equal(B.at(applied), 16);
//       });
    });
//     describe("lift", () => {
//       it("lifts function of three arguments", () => {
//         const b1 = sinkBehavior(1);
//         const b2 = sinkBehavior(1);
//         const b3 = sinkBehavior(1);
//         const lifted = lift((a, b, c) => a * b + c, b1, b2, b3);
//         lifted.observe((v) => {}, () => () => {});
//         assert.strictEqual(at(lifted), 2);
//         b2.push(2);
//         assert.strictEqual(at(lifted), 3);
//         b1.push(3);
//         assert.strictEqual(at(lifted), 7);
//         b3.push(3);
//         assert.strictEqual(at(lifted), 9);
//       });
//     });
  });
//   describe("chain", () => {
//     it("handles a constant behavior", () => {
//       const b1 = Behavior.of(12);
//       const b2 = b1.chain(x => Behavior.of(x * x));
//       b2.observe((v) => {}, () => () => {});
//       assert.strictEqual(at(b2), 144);
//     });
//     it("handles changing outer behavior", () => {
//       const b1 = sinkBehavior(0);
//       const b2 = b1.chain(x => Behavior.of(x * x));
//       b2.observe((v) => {}, () => () => {});
//       assert.strictEqual(at(b2), 0);
//       b1.push(2);
//       assert.strictEqual(at(b2), 4);
//       b1.push(3);
//       assert.strictEqual(at(b2), 9);
//     });
//     it("handles changing inner behavior", () => {
//       const inner = sinkBehavior(0);
//       const b = Behavior.of(1).chain(_ => inner);
//       const cb = spy();
//       b.observe(cb, () => () => {});
//       // assert.strictEqual(at(b), 0);
//       inner.push(2);
//       // assert.strictEqual(at(b), 2);
//       inner.push(3);
//       // assert.strictEqual(at(b), 3);
//       assert.deepEqual(cb.args, [[0], [2], [3]]);
//     });
//     it("stops subscribing to past inner behavior", () => {
//       const inner = sinkBehavior(0);
//       const outer = sinkBehavior(1);
//       const b = outer.chain(n => n === 1 ? inner : Behavior.of(6));
//       b.observe((v) => {}, () => () => {});
//       assert.strictEqual(at(b), 0);
//       inner.push(2);
//       assert.strictEqual(at(b), 2);
//       outer.push(2);
//       assert.strictEqual(at(b), 6);
//       inner.push(3);
//       assert.strictEqual(at(b), 6);
//     });
//     it("handles changes from both inner and outer", () => {
//       const outer = sinkBehavior(0);
//       const inner1 = sinkBehavior(1);
//       const inner2 = sinkBehavior(3);
//       const b = outer.chain(n => {
//         if (n === 0) {
//           return Behavior.of(0);
//         } else if (n === 1) {
//           return inner1;
//         } else if (n === 2) {
//           return inner2;
//         }
//       });
//       b.observe((v) => {}, () => () => {});
//       assert.strictEqual(at(b), 0);
//       outer.push(1);
//       assert.strictEqual(at(b), 1);
//       inner1.push(2);
//       assert.strictEqual(at(b), 2);
//       outer.push(2);
//       assert.strictEqual(at(b), 3);
//       inner1.push(7); // Pushing to previous inner should have no effect
//       assert.strictEqual(at(b), 3);
//       inner2.push(4);
//       assert.strictEqual(at(b), 4);
//     });
//     it("can switch between pulling and pushing", () => {
//       const pushingB = sinkBehavior(0);
//       let variable = 7;
//       const pullingB = fromFunction(() => variable);
//       const outer = sinkBehavior(true);
//       const chained = outer.chain((b) => b ? pushingB : pullingB);
//       const pushSpy = spy();
//       const beginPullingSpy = spy();
//       const endPullingSpy = spy();
//       const pullHandler = () => { beginPullingSpy(); return endPullingSpy; };
//       // Test that several observers are notified
//       chained.observe(pushSpy, pullHandler);
//       chained.observe(pushSpy, pullHandler);
//       chained.observe(pushSpy, pullHandler);
//       pushingB.push(1);
//       pushingB.push(2);
//       outer.push(false);
//       assert.strictEqual(at(chained), 7);
//       variable = 8;
//       assert.strictEqual(at(chained), 8);
//       pushingB.push(3);
//       pushingB.push(4);
//       outer.push(true);
//       pushingB.push(5);
//       outer.push(false);
//       variable = 9;
//       assert.strictEqual(at(chained), 9);
//       assert.deepEqual(
//         pushSpy.args,
//         [[0], [0], [0], [1], [1], [1], [2], [2], [2], [4], [4], [4], [5], [5], [5]]
//       );
//       assert.equal(beginPullingSpy.callCount, 6);
//       assert.equal(endPullingSpy.callCount, 3);
//     });
//     it("works with go-notation", () => {
//       const a = sinkBehavior(1);
//       const b = go(function* (): IterableIterator<any> {
//         const val = yield a;
//         return val * 2;
//       });
//       const spy = subscribeSpy(b);
//       a.push(7);
//       assert.deepEqual(spy.args, [[2], [14]]);
//     });
//     it("supports adding pullers", () => {
//       const b1 = Behavior.of(12);
//       const b2 = b1.chain(x => Behavior.of(x * x));
//       b2.changePullers(1);
//     });
//   });
//   describe("integrate", () => {
//     it("can integrate", () => {
//       const clock = useFakeTimers();
//       const acceleration = sinkBehavior(1);
//       const i = integrate(acceleration);
//       const integration = at(i);
//       i.observe((v) => {}, () => () => {});
//       assert.strictEqual(at(integration), 0);
//       clock.tick(2000);
//       assert.strictEqual(at(integration), 2);
//       clock.tick(1000);
//       assert.strictEqual(at(integration), 3);
//       clock.tick(500);
//       acceleration.push(2);
//       assert.strictEqual(at(integration), 4);
//       clock.restore();
//     });
//   });
});

// describe("Behavior and Future", () => {
//   describe("when", () => {
//     it("gives occurred future when behavior is true", () => {
//       let occurred = false;
//       const b = Behavior.of(true);
//       const w = B.when(b);
//       const fut = at(w);
//       fut.subscribe((_) => occurred = true);
//       assert.strictEqual(occurred, true);
//     });
//     it("future occurs when behavior turns true", () => {
//       let occurred = false;
//       const b = sinkBehavior(false);
//       const w = B.when(b);
//       const fut = at(w);
//       fut.subscribe((_) => occurred = true);
//       assert.strictEqual(occurred, false);
//       b.push(true);
//       assert.strictEqual(occurred, true);
//     });
//   });
//   describe("snapshotAt", () => {
//     it("snapshots behavior at future occurring in future", () => {
//       let result: number;
//       const bSink = sinkBehavior(1);
//       const futureSink = F.sinkFuture();
//       const mySnapshot = at(B.snapshotAt(bSink, futureSink));
//       mySnapshot.subscribe(res => result = res);
//       bSink.push(2);
//       bSink.push(3);
//       futureSink.resolve({});
//       bSink.push(4);
//       assert.strictEqual(result, 3);
//     });
//     it("uses current value when future occurred in the past", () => {
//       let result: number;
//       const bSink = sinkBehavior(1);
//       const occurredFuture = Future.of({});
//       bSink.push(2);
//       const mySnapshot = at(B.snapshotAt(bSink, occurredFuture));
//       mySnapshot.subscribe(res => result = res);
//       bSink.push(3);
//       assert.strictEqual(result, 2);
//     });
//   });
//   describe("switchTo", () => {
//     it("switches to new behavior", () => {
//       const b1 = sinkBehavior(1);
//       const b2 = sinkBehavior(8);
//       const futureSink = F.sinkFuture<Behavior<number>>();
//       const switching = switchTo(b1, futureSink);
//       assert.strictEqual(at(switching), 1);
//       b2.push(9);
//       assert.strictEqual(at(switching), 1);
//       b1.push(2);
//       assert.strictEqual(at(switching), 2);
//       b1.push(3);
//       assert.strictEqual(at(switching), 3);
//       futureSink.resolve(b2);
//       assert.strictEqual(at(switching), 9);
//       b2.push(10);
//       assert.strictEqual(at(switching), 10);
//     });
//     it("changes from push to pull", () => {
//       const pushSpy = spy();
//       const beginPullingSpy = spy();
//       const endPullingSpy = spy();
//       const pullHandler = () => { beginPullingSpy(); return endPullingSpy; };
//       const pushingB = sinkBehavior(0);
//       let x = 7;
//       const pullingB = fromFunction(() => x);
//       const futureSink = F.sinkFuture<Behavior<number>>();
//       const switching = switchTo(pushingB, futureSink);
//       observe(pushSpy, pullHandler, switching);
//       assert.strictEqual(at(switching), 0);
//       pushingB.push(1);
//       assert.strictEqual(at(switching), 1);
//       futureSink.resolve(pullingB);
//       assert.strictEqual(at(switching), 7);
//       x = 8;
//       assert.strictEqual(at(switching), 8);
//       assert.strictEqual(beginPullingSpy.callCount, 1);
//       assert.strictEqual(endPullingSpy.callCount, 0);
//     });
//     it("changes from pull to push", () => {
//       let beginPull = false;
//       let endPull = false;
//       let pushed: number[] = [];
//       let x = 0;
//       const b1 = B.fromFunction(() => x);
//       const b2 = sinkBehavior(2);
//       const futureSink = F.sinkFuture<Behavior<number>>();
//       const switching = switchTo(b1, futureSink);
//       observe(
//         (n: number) => pushed.push(n),
//         () => {
//           beginPull = true;
//           return () => endPull = true;
//         },
//         switching
//       );
//       assert.strictEqual(beginPull, true);
//       assert.strictEqual(at(switching), 0);
//       x = 1;
//       assert.strictEqual(at(switching), 1);
//       assert.strictEqual(endPull, false);
//       futureSink.resolve(b2);
//       assert.strictEqual(endPull, true);
//       b2.push(3);
//       assert.deepEqual(pushed, [2, 3]);
//     });
//   });
// });

// describe("Behavior and Stream", () => {
//   describe("switcher", () => {
//     it("switches to behavior", () => {
//       const result: number[] = [];
//       const stream = sinkStream<Behavior<number>>();
//       const initB = Behavior.of(1);
//       const outerSwitcher = switcher(initB, stream);
//       const switchingB = at(outerSwitcher);
//       switchingB.subscribe((n) => result.push(n));
//       const sinkB = sinkBehavior(2);
//       stream.push(sinkB);
//       sinkB.push(3);
//       assert.deepEqual(result, [1, 2, 3]);
//       assert.deepEqual(at(at(outerSwitcher)), 1);
//     });
//   });
//   describe("stepper", () => {
//     it("steps to the last event value", () => {
//       const s = sinkStream();
//       const b = stepper(0, s).at();
//       const cb = subscribeSpy(b);
//       s.push(1);
//       s.push(2);
//       assert.deepEqual(cb.args, [[0], [1], [2]]);
//     });
//     it("saves last occurrence from stream", () => {
//       const s = sinkStream();
//       const t = stepper(1, s).at();
//       s.push(12);
//       const spy = subscribeSpy(t);
//       assert.deepEqual(spy.args, [[12]]);
//     });
//     it("has old value in exact moment", () => {
//       const s = sinkStream();
//       const b = stepper(0, s).at();
//       const res = snapshot(b, s);
//       const spy = subscribeSpy(res);
//       s.push(1);
//       assert.strictEqual(b.at(), 1);
//       s.push(2);
//       assert.strictEqual(b.at(), 2);
//       assert.deepEqual(spy.args, [[0], [1]]);
//     });
//   });
//   describe("scan", () => {
//     it("has scan as method on stream", () => {
//       const scanned = empty.scan(sum, 0);
//     });
//     it("accumulates in a pure way", () => {
//       const s = sinkStream<number>();
//       const scanned = scan(sum, 1, s);
//       const b1 = scanned.at();
//       const spy = subscribeSpy(b1);
//       assert.strictEqual(at(b1), 1);
//       s.push(2);
//       assert.strictEqual(at(b1), 3);
//       const b2 = at(scanned);
//       assert.strictEqual(at(b2), 1);
//       s.push(4);
//       assert.strictEqual(at(b1), 7);
//       assert.strictEqual(at(b2), 5);
//       assert.deepEqual(spy.args, [[1], [3], [7]]);
//     });
//     it("has semantic representation", () => {
//       const s = testStreamFromObject({
//         1: 1, 2: 1, 4: 2, 6: 3, 7: 1
//       });
//       const scanned = scan((n, m) => n + m, 0, s);
//       const semantic = scanned.semantic();

//       const from0 = semantic(0).semantic();
//       assert.strictEqual(from0(0), 0);
//       assert.strictEqual(from0(1), 1);
//       assert.strictEqual(from0(2), 2);
//       assert.strictEqual(from0(3), 2);
//       assert.strictEqual(from0(4), 4);

//       const from3 = semantic(3).semantic();
//       assert.strictEqual(from3(3), 0);
//       assert.strictEqual(from3(4), 2);
//       assert.strictEqual(from3(5), 2);
//       assert.strictEqual(from3(6), 5);
//       assert.strictEqual(from3(7), 6);
//     });
//   });
//   describe("scanCombine", () => {
//     it("combines several streams", () => {
//       const add = sinkStream();
//       const sub = sinkStream();
//       const mul = sinkStream();
//       const b = scanCombine([
//         [add, (n, m) => n + m],
//         [sub, (n, m) => m - n],
//         [mul, (n, m) => n * m]
//       ], 1);
//       const cb = subscribeSpy(b.at());
//       add.push(3);
//       mul.push(3);
//       sub.push(5);
//       assert.deepEqual(cb.args, [[1], [4], [12], [7]]);
//     });
//   });
//   describe("switchStream", () => {
//     it("returns stream that emits from stream", () => {
//       const s1 = sinkStream();
//       const s2 = sinkStream();
//       const s3 = sinkStream();
//       const b = sinkBehavior(s1);
//       const switching = switchStream(b);
//       const cb = spy();
//       switching.subscribe(cb);
//       s1.push(1);
//       s1.push(2);
//       b.push(s2);
//       s2.push(3);
//       b.push(s3);
//       s2.push(4);
//       s3.push(5);
//       s3.push(6);
//       assert.deepEqual(cb.args, [[1], [2], [3], [5], [6]]);
//     });
//   });
//   describe("continuous time", () => {
//     it("gives time from sample point", () => {
//       const [setTime, restore] = mockNow();
//       setTime(3);
//       const time = at(timeFrom);
//       assert.strictEqual(at(time), 0);
//       setTime(4);
//       assert.strictEqual(at(time), 1);
//       setTime(7);
//       assert.strictEqual(at(time), 4);
//       restore();
//     });
//     it("gives time since UNIX epoch", () => {
//       let beginPull = false;
//       let endPull = false;
//       let pushed: number[] = [];
//       observe(
//         (n: number) => pushed.push(n),
//         () => {
//           beginPull = true;
//           return () => endPull = true;
//         },
//         time
//       );
//       assert.strictEqual(beginPull, true);
//       const t = at(time);
//       const now = Date.now();
//       assert(now - 2 <= t && t <= now);
//       assert.strictEqual(endPull, false);
//     });
//     it("has semantic representation", () => {
//       const f = time.semantic();
//       assert.strictEqual(f(0), 0);
//       assert.strictEqual(f(1.3), 1.3);
//     });
//   });
//   describe("toggle", () => {
//     it("has correct initial value", () => {
//       const s1 = sinkStream();
//       const s2 = sinkStream();
//       const flipper1 = toggle(true, s1, s2).at();
//       assert.strictEqual(at(flipper1), true);
//       const flipper2 = toggle(false, s1, s2).at();
//       assert.strictEqual(at(flipper2), false);
//     });
//     it("flips properly", () => {
//       const s1 = sinkStream();
//       const s2 = sinkStream();
//       const flipper = toggle(false, s1, s2).at();
//       const cb = subscribeSpy(flipper);
//       s1.push(1);
//       s2.push(2);
//       s1.push(3);
//       assert.deepEqual(
//         cb.args,
//         [[false], [true], [false], [true]]
//       );
//     });
//   });
//   describe("moment", () => {
//     it("works as lift", () => {
//       const b1 = sinkBehavior(0);
//       const b2 = sinkBehavior(1);
//       const derived = moment((at) => {
//         return at(b1) + at(b2);
//       });
//       const spy = subscribeSpy(derived);
//       b1.push(2);
//       b2.push(3);
//       assert.deepEqual(spy.args, [[1], [3], [5]]);
//     });
//     it("adds and removes dependencies", () => {
//       const flag = sinkBehavior(true);
//       const b1 = sinkBehavior(2);
//       const b2 = sinkBehavior(3);
//       const derived = moment((at) => {
//         return at(flag) ? at(b1) : at(b2);
//       });
//       const spy = subscribeSpy(derived);
//       b1.push(4);
//       flag.push(false);
//       b2.push(5);
//       b1.push(6);
//       assert.deepEqual(spy.args, [[2], [4], [3], [5]]);
//     });
//     it("can combine behaviors from array", () => {
//       const nr1 = sinkBehavior(4);
//       const nr2 = sinkBehavior(3);
//       const nr3 = sinkBehavior(2);
//       const count1 = { count: nr1 };
//       const count2 = { count: nr2 };
//       const count3 = { count: nr3 };
//       const list: Behavior<{ count: Behavior<number> }[]> = sinkBehavior([]);
//       const derived = moment((at) => {
//         return at(list).map(({ count }) => at(count)).reduce((n, m) => n + m, 0);
//       });
//       const spy = subscribeSpy(derived);
//       list.push([count1, count2, count3]);
//       nr2.push(5);
//       list.push([count1, count3]);
//       nr2.push(10);
//       nr3.push(3);
//       assert.deepEqual(spy.args, [[0], [9], [11], [6], [7]]);
//     });
//     it("works with placeholders", () => {
//       const p = placeholder<number>();
//       const b0 = sinkBehavior(3);
//       const b1 = sinkBehavior(1);
//       const b2 = sinkBehavior(2);
//       const derived = moment((at) => {
//         return at(b1) + at(p) + at(b2);
//       });
//       const spy = subscribeSpy(derived);
//       b1.push(2);
//       p.replaceWith(b0);
//       p.push(0);
//       assert.deepEqual(spy.args, [[7], [4]]);
//     });
//     it("works with snapshot", () => {
//       const b1 = sinkBehavior(1);
//       const b2 = moment((at) => at(b1) * 2);
//       const snapped = snapshot(b2, empty);
//       const cb = subscribeSpy(snapped);
//     });
//   });
// });

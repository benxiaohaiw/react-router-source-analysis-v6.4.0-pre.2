/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as React from "react";

/**
 * inlined Object.is polyfill to avoid requiring consumers ship their own
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
 */
function isPolyfill(x: any, y: any) {
  return (
    (x === y && (x !== 0 || 1 / x === 1 / y)) || (x !== x && y !== y) // eslint-disable-line no-self-compare
  );
}

const is: (x: any, y: any) => boolean =
  typeof Object.is === "function" ? Object.is : isPolyfill;

// Intentionally not using named imports because Rollup uses dynamic
// dispatch for CommonJS interop named imports.
const { useState, useEffect, useLayoutEffect, useDebugValue } = React;

let didWarnOld18Alpha = false;
let didWarnUncachedGetSnapshot = false;

// Disclaimer: This shim breaks many of the rules of React, and only works
// because of a very particular set of implementation details and assumptions
// -- change any one of them and it will break. The most important assumption
// is that updates are always synchronous, because concurrent rendering is
// only available in versions of React that also have a built-in
// useSyncExternalStore API. And we only use this shim when the built-in API
// does not exist.
//
// Do not assume that the clever hacks used by this hook also work in general.
// The point of this shim is to replace the need for hacks by other libraries.
export function useSyncExternalStore<T>(
  subscribe: (fn: () => void) => () => void,
  getSnapshot: () => T,
  // Note: The shim does not use getServerSnapshot, because pre-18 versions of
  // React do not expose a way to check if we're hydrating. So users of the shim
  // will need to track that themselves and return the correct value
  // from `getSnapshot`.
  getServerSnapshot?: () => T
): T { // 这里做了一个hack polyfill 垫片 /// +++
  if (__DEV__) {
    if (!didWarnOld18Alpha) {
      if ("startTransition" in React) {
        didWarnOld18Alpha = true;
        console.error(
          "You are using an outdated, pre-release alpha of React 18 that " +
            "does not support useSyncExternalStore. The " +
            "use-sync-external-store shim will not work correctly. Upgrade " +
            "to a newer pre-release."
        );
      }
    }
  }

  // Read the current snapshot from the store on every render. Again, this
  // breaks the rules of React, and only works here because of specific
  // implementation details, most importantly that updates are
  // always synchronous.
  const value = getSnapshot();
  if (__DEV__) {
    if (!didWarnUncachedGetSnapshot) {
      const cachedValue = getSnapshot();
      if (!is(value, cachedValue)) {
        console.error(
          "The result of getSnapshot should be cached to avoid an infinite loop"
        );
        didWarnUncachedGetSnapshot = true;
      }
    }
  }

  // Because updates are synchronous, we don't queue them. Instead we force a
  // re-render whenever the subscribed state changes by updating an some
  // arbitrary useState hook. Then, during render, we call getSnapshot to read
  // the current value.
  //
  // Because we don't actually use the state returned by the useState hook, we
  // can save a bit of memory by storing other stuff in that slot.
  //
  // To implement the early bailout, we need to track some things on a mutable
  // object. Usually, we would put that in a useRef hook, but we can stash it in
  // our useState hook instead.
  //
  // To force a re-render, we call forceUpdate({inst}). That works because the
  // new object always fails an equality check.
  const [{ inst }, forceUpdate /** dispatchSetState函数 */] = useState({ inst: { value, getSnapshot } });

  // Track the latest getSnapshot function with a ref. This needs to be updated
  // in the layout phase so we can access it during the tearing check that
  // happens on subscribe.
  useLayoutEffect(() => {
    inst.value = value;
    inst.getSnapshot = getSnapshot;

    // Whenever getSnapshot or subscribe changes, we need to check in the
    // commit phase if there was an interleaved mutation. In concurrent mode
    // this can happen all the time, but even in synchronous mode, an earlier
    // effect may have mutated the store.
    if (checkIfSnapshotChanged(inst)) {
      // Force a re-render.
      forceUpdate({ inst });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, value, getSnapshot]);

  // useEffect
  useEffect(() => {
    // Check for changes right before subscribing. Subsequent changes will be
    // detected in the subscription handler.
    if (checkIfSnapshotChanged(inst)) {
      // Force a re-render.
      forceUpdate({ inst });
    }

    // 处理store变化函数
    const handleStoreChange = () => {
      // TODO: Because there is no cross-renderer API for batching updates, it's
      // up to the consumer of this library to wrap their subscription event
      // with unstable_batchedUpdates. Should we try to detect when this isn't
      // the case and print a warning in development?

      // The store changed. Check if the snapshot changed since the last time we
      // read from the store.
      if (checkIfSnapshotChanged(inst)) { // 检查快照是否变化 // +++
        // 强制一个重新渲染 // +++
        // Force a re-render.
        forceUpdate({ inst }); // +++ 这里也就是dispatchSetState函数 // +++
      }
    };
    // Subscribe to the store and return a clean-up function.
    return subscribe(handleStoreChange); // 执行subscribe函数 - 传入handleStoreChange参数函数
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe]);

  useDebugValue(value);
  return value;
}

function checkIfSnapshotChanged(inst: any) {
  const latestGetSnapshot = inst.getSnapshot;
  const prevValue = inst.value;
  try {
    const nextValue = latestGetSnapshot();
    return !is(prevValue, nextValue);
  } catch (error) {
    return true;
  }
}

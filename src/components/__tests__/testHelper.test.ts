import { describe, it, expect, vi } from 'vitest';
import { createReactHookMock } from './testHelper';

describe('testHelper — createReactHookMock coverage', () => {
  it('runs effect cleanup on re-run when deps change', () => {
    const cleanup = vi.fn();
    const effect = vi.fn(() => cleanup);
    let depValue = 1;

    // A minimal component that registers one effect whose deps change
    const Comp = () => {
      mock.useEffect(effect, [depValue]);
      return { type: 'View', props: {} };
    };

    const mock = createReactHookMock();
    mock.init(Comp, {});
    mock.runEffects();

    // First run: effect executed, cleanup stored
    expect(effect).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();

    // Change deps and re-render so the effect is marked changed
    depValue = 2;
    mock.rerender();
    mock.runEffects();

    // Second run: previous cleanup called, then effect re-executed
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('ignores cleanup errors in runEffects without crashing', () => {
    const throwingCleanup = () => { throw new Error('boom'); };
    const effect = vi.fn(() => throwingCleanup);
    let depValue = 1;

    const Comp = () => {
      mock.useEffect(effect, [depValue]);
      return { type: 'View', props: {} };
    };

    const mock = createReactHookMock();
    mock.init(Comp, {});
    mock.runEffects();

    depValue = 2;
    mock.rerender();

    // Should not throw even though cleanup throws
    expect(() => mock.runEffects()).not.toThrow();
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('supports functional updater form in setState', () => {
    const Comp = () => {
      const [count, setCount] = mock.useState(0);
      return { type: 'View', props: { count, setCount } };
    };

    const mock = createReactHookMock();
    mock.init(Comp, {});

    // Use functional updater: setState(prev => prev + 1)
    mock.stateSetters[0]((prev: number) => prev + 1);
    expect(mock.stateValues[0]).toBe(1);

    mock.stateSetters[0]((prev: number) => prev + 10);
    expect(mock.stateValues[0]).toBe(11);
  });

  it('treats effect with no deps as always changed', () => {
    const effect = vi.fn();

    const Comp = () => {
      mock.useEffect(effect, undefined);
      return { type: 'View', props: {} };
    };

    const mock = createReactHookMock();
    mock.init(Comp, {});
    mock.runEffects();
    expect(effect).toHaveBeenCalledTimes(1);

    // Re-render without changing anything — undefined deps always re-run
    mock.rerender();
    mock.runEffects();
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('does not re-run effect when deps are unchanged', () => {
    const effect = vi.fn();

    const Comp = () => {
      mock.useEffect(effect, [1, 2]);
      return { type: 'View', props: {} };
    };

    const mock = createReactHookMock();
    mock.init(Comp, {});
    mock.runEffects();
    expect(effect).toHaveBeenCalledTimes(1);

    // Re-render with same deps — effect should NOT re-run
    mock.rerender();
    mock.runEffects();
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('handles useState with function initializer', () => {
    const Comp = () => {
      const [val] = mock.useState(() => 42);
      return { type: 'View', props: { val } };
    };

    const mock = createReactHookMock();
    mock.init(Comp, {});
    expect(mock.stateValues[0]).toBe(42);
  });

  it('rerender without init does not crash (no currentComponent)', () => {
    const mock = createReactHookMock();
    // rerender before init — currentComponent is null
    expect(() => mock.rerender()).not.toThrow();
  });

  it('effect returning non-function does not set cleanup', () => {
    const effect = vi.fn(() => undefined);
    let dep = 1;

    const Comp = () => {
      mock.useEffect(effect, [dep]);
      return { type: 'View', props: {} };
    };

    const mock = createReactHookMock();
    mock.init(Comp, {});
    mock.runEffects();
    expect(effect).toHaveBeenCalledTimes(1);

    // Re-run — no cleanup should be called because effect returned undefined
    dep = 2;
    mock.rerender();
    mock.runEffects();
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('unmount calls cleanup and ignores cleanup errors', () => {
    const throwingCleanup = vi.fn(() => { throw new Error('unmount boom'); });
    const effect = vi.fn(() => throwingCleanup);

    const Comp = () => {
      mock.useEffect(effect, [1]);
      return { type: 'View', props: {} };
    };

    const mock = createReactHookMock();
    mock.init(Comp, {});
    mock.runEffects();

    // unmount should call cleanup and not throw
    expect(() => mock.unmount()).not.toThrow();
    expect(throwingCleanup).toHaveBeenCalledTimes(1);
  });

  it('useRef returns stable ref across rerenders', () => {
    const Comp = () => {
      const ref = mock.useRef(null);
      return { type: 'View', props: { ref } };
    };

    const mock = createReactHookMock();
    mock.init(Comp, {});

    const ref1 = mock.refs[0];
    mock.rerender();
    const ref2 = mock.refs[0];

    expect(ref1).toBe(ref2);
    expect(ref1.current).toBeNull();
  });
});

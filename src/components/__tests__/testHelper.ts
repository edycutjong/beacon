export function createReactHookMock() {
  let hookIndex = 0;
  const hooks: any[] = [];
  const effects: { effect: () => void | (() => void); deps: any[] | undefined; cleanup?: () => void; changed?: boolean }[] = [];

  const useState = (initialState: any) => {
    const index = hookIndex++;
    if (hooks.length <= index) {
      const val = typeof initialState === 'function' ? initialState() : initialState;
      const setter = (newValue: any) => {
        const currentVal = hooks[index].value;
        const nextVal = typeof newValue === 'function' ? newValue(currentVal) : newValue;
        hooks[index].value = nextVal;
        rerender();
      };
      hooks.push({ type: 'state', value: val, setter });
    }
    return [hooks[index].value, hooks[index].setter];
  };

  const useEffect = (effect: any, deps: any) => {
    const index = hookIndex++;
    if (hooks.length <= index) {
      const effectObj = { effect, deps, changed: true };
      hooks.push({ type: 'effect', effectObj });
      effects.push(effectObj);
    } else {
      const prev = hooks[index].effectObj;
      let changed = !prev || !prev.deps || !deps;
      if (!changed && prev.deps && deps) {
        changed = prev.deps.some((d: any, i: number) => d !== deps[i]);
      }
      const effectObj = { effect, deps, cleanup: prev?.cleanup, changed };
      hooks[index].effectObj = effectObj;
      
      effects[effects.indexOf(prev)] = effectObj;
    }
  };

  const useRef = (initialValue: any) => {
    const index = hookIndex++;
    if (hooks.length <= index) {
      hooks.push({ type: 'ref', current: initialValue });
    }
    return hooks[index];
  };

  let currentComponent: any = null;
  let currentProps: any = null;
  let element: any = null;

  function rerender(newProps = currentProps) {
    hookIndex = 0;
    currentProps = newProps;
    if (currentComponent) {
      element = currentComponent(currentProps);
    }
  }

  function runEffects() {
    effects.forEach((eff) => {
      if (eff.changed !== false) {
        if (eff.cleanup) {
          try {
            eff.cleanup();
          } catch {
            // ignore cleanup errors
          }
        }
        const cleanup = eff.effect();
        if (typeof cleanup === 'function') {
          eff.cleanup = cleanup;
        }
        eff.changed = false;
      }
    });
  }

  function unmount() {
    effects.forEach((eff) => {
      if (eff.cleanup) {
        try {
          eff.cleanup();
        } catch {
          // ignore cleanup errors
        }
      }
    });

  }

  return {
    useState,
    useEffect,
    useRef,
    init(Comp: any, initialProps: any) {
      currentComponent = Comp;
      currentProps = initialProps;
      rerender();
      return element;
    },
    get element() { return element; },
    rerender,
    runEffects,
    unmount,
    get stateValues() {
      return hooks.filter(h => h.type === 'state').map(h => h.value);
    },
    get stateSetters() {
      return hooks.filter(h => h.type === 'state').map(h => h.setter);
    },
    get refs() {
      return hooks.filter(h => h.type === 'ref');
    },
  };
}

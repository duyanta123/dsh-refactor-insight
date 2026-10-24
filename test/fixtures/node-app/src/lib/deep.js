/* Deep-nesting fixture (JS). Intentionally deeply nested; the markers below are the only smell markers in this file. */
// TODO: break this into tiny helpers

export function process(cfg, registry) {
  const inner = {
    run: () => {
      for (let i = 0; i < 10; i++) {
        if (cfg.flag) {
          while (cfg.next) {
            // FIXME: simplify condition
            registry.push(i);
          }
        }
      }
    },
  };
  return inner;
}

export function clean(a, b) {
  return a + b;
}
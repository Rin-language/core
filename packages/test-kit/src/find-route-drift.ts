export interface MountedRoute {
  method: string;
  path: string;
}

export interface RouteDrift {
  /** Mounted but absent from the document. */
  undocumented: string[];
  /** In the document but not mounted. */
  unmounted: string[];
}

export interface DriftOptions {
  /** Endpoints that are served on purpose outside the API, such as "GET /docs". */
  ignore?: readonly string[];
}

const MIDDLEWARE_METHOD = "ALL";

/**
 * Compares the routes an application mounts with the operations of its OpenAPI
 * document. A route in one and not the other means the registry was bypassed.
 */
export function findRouteDrift(
  mountedRoutes: readonly MountedRoute[],
  document: { paths: Record<string, Record<string, unknown>> },
  options: DriftOptions = {},
): RouteDrift {
  const ignored = new Set(options.ignore);
  const mounted = new Set(
    mountedRoutes
      .filter(({ method }) => method !== MIDDLEWARE_METHOD)
      .map(({ method, path }) => `${method} ${path}`)
      .filter((endpoint) => !ignored.has(endpoint)),
  );
  const documented = new Set(
    Object.entries(document.paths).flatMap(([path, operations]) =>
      Object.keys(operations).map(
        (method) => `${method.toUpperCase()} ${path}`,
      ),
    ),
  );
  return {
    undocumented: [...mounted].filter((endpoint) => !documented.has(endpoint)),
    unmounted: [...documented].filter((endpoint) => !mounted.has(endpoint)),
  };
}

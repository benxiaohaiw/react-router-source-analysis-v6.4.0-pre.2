import * as React from "react";
import type {
  TrackedPromise,
  InitialEntry,
  Location,
  MemoryHistory,
  Router as RemixRouter,
  RouterState,
  To,
} from "@remix-run/router";
import {
  Action as NavigationType,
  AbortedDeferredError,
  createMemoryHistory,
  invariant,
  parsePath,
  stripBasename,
  warning,
} from "@remix-run/router";
import { useSyncExternalStore as useSyncExternalStoreShim } from "./use-sync-external-store-shim";

import type {
  DataRouteObject,
  IndexRouteObject,
  RouteMatch,
  RouteObject,
  Navigator,
  NonIndexRouteObject,
  RelativeRoutingType,
} from "./context";
import {
  LocationContext,
  NavigationContext,
  DataRouterContext,
  DataRouterStateContext,
  AwaitContext,
} from "./context";
import {
  useAsyncValue,
  useInRouterContext,
  useNavigate,
  useOutlet,
  useRoutes,
  _renderMatches,
} from "./hooks";

export interface RouterProviderProps {
  fallbackElement?: React.ReactNode;
  router: RemixRouter;
}

/**
 * 给定一个 Remix Router 实例，渲染适当的 UI // +++
 * Given a Remix Router instance, render the appropriate UI
 */
export function RouterProvider({ // RouterProvider函数式组件 // +++
  fallbackElement, // props中的fallbackElement
  router, // props中的router
}: RouterProviderProps): React.ReactElement {
  // 将路由器状态同步到我们的组件状态以强制重新渲染 // +++
  // Sync router state to our component state to force re-renders
  let state: RouterState = useSyncExternalStoreShim(
    router.subscribe, // 订阅函数
    () => router.state, // 获取快照函数
    // We have to provide this so React@18 doesn't complain during hydration,
    // but we pass our serialized hydration data into the router so state here
    // is already synced with what the server saw
    () => router.state
  );
  // 其实就是react 18中的useSyncExternalStore hook，这个hook内部就是使用useEffect hook
  // 所以最终效果是【异步宏任务】中去执行关于useEffect的destroy函数和create函数
  // 那么也就是在其中执行了router.subscribe函数并且传入了一个handleStoreChange参数函数 - 这个函数内部包含forceUpdate函数
  // 所以在路由器对象的subscribers数组中将存入handleStoreChange函数 // +++

  // 计算出一个navigator对象 // +++
  let navigator = React.useMemo((): Navigator => {
    return {
      createHref: router.createHref,
      // +++
      // 使用的都是路由器对象的navigate函数 // +++
      go: (n) => router.navigate(n),
      // push函数
      push: (to, state, opts) =>
      // 就是路由器对象中的navigate函数的执行啦 ~
        router.navigate(to /** {pathname: '/contacts/蔡文静', search, hash, ...} */, {
          state,
          preventScrollReset: opts?.preventScrollReset,
        }),
      replace: (to, state, opts) =>
        router.navigate(to, {
          replace: true, // replace参数为true
          state,
          preventScrollReset: opts?.preventScrollReset,
        }),
    };
  }, [router]);

  // 路由器对象的basename属性，没有则默认为/
  let basename = router.basename || "/";

  return (
    <DataRouterContext.Provider // 数据路由器上下文
      value={{ // 提供的值对象
        router, // 路由器
        navigator, // 导航器
        static: false, // 不是静态的
        // Do we need this?
        basename, // 基础名
      }}
    >
      <DataRouterStateContext.Provider value={state} /** 提供的值对象 - 其实就是路由器的state对象 */> {/** 数据路由器状态上下文 */}
        {/** 路由器函数式组件 */}
        <Router
          basename={router.basename}
          location={router.state.location}
          navigationType={router.state.historyAction}
          navigator={navigator} /** 上面计算出来的【导航器】 */
        >
          {/* 根据路由器状态是否已初始化 */}
          {router.state.initialized ? <Routes /> /** 路由函数式组件 */ : fallbackElement /** 回退元素 */}
          {/** 没有初始化将不会显示Routes组件，而是渲染fallbackElement，若没有fallbackElement属性这里就是对于Router组件而言它的children属性就是undefined，所以页面也就没有任何东西啦 ~ */}
        </Router>
      </DataRouterStateContext.Provider>
    </DataRouterContext.Provider>
  );
}

export interface MemoryRouterProps {
  basename?: string;
  children?: React.ReactNode;
  initialEntries?: InitialEntry[];
  initialIndex?: number;
}

/**
 * A <Router> that stores all entries in memory.
 *
 * @see https://reactrouter.com/docs/en/v6/routers/memory-router
 */
export function MemoryRouter({
  basename,
  children,
  initialEntries,
  initialIndex,
}: MemoryRouterProps): React.ReactElement {
  let historyRef = React.useRef<MemoryHistory>();
  if (historyRef.current == null) {
    historyRef.current = createMemoryHistory({
      initialEntries,
      initialIndex,
      v5Compat: true,
    });
  }

  let history = historyRef.current;
  let [state, setState] = React.useState({
    action: history.action,
    location: history.location,
  });

  React.useLayoutEffect(() => history.listen(setState), [history]);

  return (
    <Router
      basename={basename}
      children={children}
      location={state.location}
      navigationType={state.action}
      navigator={history}
    />
  );
}

export interface NavigateProps {
  to: To;
  replace?: boolean;
  state?: any;
  relative?: RelativeRoutingType;
}

/**
 * Changes the current location.
 *
 * Note: This API is mostly useful in React.Component subclasses that are not
 * able to use hooks. In functional components, we recommend you use the
 * `useNavigate` hook instead.
 *
 * @see https://reactrouter.com/docs/en/v6/components/navigate
 */
export function Navigate({
  to,
  replace,
  state,
  relative,
}: NavigateProps): null {
  invariant(
    useInRouterContext(),
    // TODO: This error is probably because they somehow have 2 versions of
    // the router loaded. We can help them understand how to avoid that.
    `<Navigate> may be used only in the context of a <Router> component.`
  );

  warning(
    !React.useContext(NavigationContext).static,
    `<Navigate> must not be used on the initial render in a <StaticRouter>. ` +
      `This is a no-op, but you should modify your code so the <Navigate> is ` +
      `only ever rendered in response to some user interaction or state change.`
  );

  let dataRouterState = React.useContext(DataRouterStateContext);
  let navigate = useNavigate();

  React.useEffect(() => {
    // Avoid kicking off multiple navigations if we're in the middle of a
    // data-router navigation, since components get re-rendered when we enter
    // a submitting/loading state
    if (dataRouterState && dataRouterState.navigation.state !== "idle") {
      return;
    }
    navigate(to, { replace, state, relative });
  });

  return null;
}

export interface OutletProps {
  context?: unknown;
}

/**
 * Renders the child route's element, if there is one.
 *
 * @see https://reactrouter.com/docs/en/v6/components/outlet
 */
export function Outlet(props: OutletProps): React.ReactElement | null { // Outlet函数式组件 // <Outlet />
  return useOutlet(props.context /** undefined */); // 直接使用useOutlet hook // +++
}

export interface PathRouteProps {
  caseSensitive?: NonIndexRouteObject["caseSensitive"];
  path?: NonIndexRouteObject["path"];
  id?: NonIndexRouteObject["id"];
  loader?: NonIndexRouteObject["loader"];
  action?: NonIndexRouteObject["action"];
  hasErrorBoundary?: NonIndexRouteObject["hasErrorBoundary"];
  shouldRevalidate?: NonIndexRouteObject["shouldRevalidate"];
  handle?: NonIndexRouteObject["handle"];
  index?: false;
  children?: React.ReactNode;
  element?: React.ReactNode | null;
  errorElement?: React.ReactNode | null;
}

export interface LayoutRouteProps extends PathRouteProps {}

export interface IndexRouteProps {
  caseSensitive?: IndexRouteObject["caseSensitive"];
  path?: IndexRouteObject["path"];
  id?: IndexRouteObject["id"];
  loader?: IndexRouteObject["loader"];
  action?: IndexRouteObject["action"];
  hasErrorBoundary?: IndexRouteObject["hasErrorBoundary"];
  shouldRevalidate?: IndexRouteObject["shouldRevalidate"];
  handle?: IndexRouteObject["handle"];
  index: true;
  children?: undefined;
  element?: React.ReactNode | null;
  errorElement?: React.ReactNode | null;
}

export type RouteProps = PathRouteProps | LayoutRouteProps | IndexRouteProps;

/**
 * Declares an element that should be rendered at a certain URL path.
 *
 * @see https://reactrouter.com/docs/en/v6/components/route
 */
export function Route(_props: RouteProps): React.ReactElement | null {
  invariant(
    false,
    `A <Route> is only ever to be used as the child of <Routes> element, ` +
      `never rendered directly. Please wrap your <Route> in a <Routes>.`
  );
}

export interface RouterProps {
  basename?: string;
  children?: React.ReactNode;
  location: Partial<Location> | string;
  navigationType?: NavigationType;
  navigator: Navigator;
  static?: boolean;
}

/**
 * Provides location context for the rest of the app.
 *
 * Note: You usually won't render a <Router> directly. Instead, you'll render a
 * router that is more specific to your environment such as a <BrowserRouter>
 * in web browsers or a <StaticRouter> for server rendering.
 *
 * @see https://reactrouter.com/docs/en/v6/routers/router
 */
export function Router({
  basename: basenameProp = "/",
  children = null,
  location: locationProp,
  navigationType = NavigationType.Pop,
  navigator,
  static: staticProp = false,
}: RouterProps): React.ReactElement | null { // 路由器函数式组件
  invariant(
    !useInRouterContext(),
    `You cannot render a <Router> inside another <Router>.` +
      ` You should never have more than one in your app.`
  );

  // Preserve trailing slashes on basename, so we can let the user control
  // the enforcement of trailing slashes throughout the app
  let basename = basenameProp.replace(/^\/*/, "/"); // 确保开头有且只有一个/ // +++

  // 计算导航上下文值对象
  let navigationContext = React.useMemo(
    () => ({ basename, navigator, static: staticProp }),
    [basename, navigator, staticProp]
  );

  if (typeof locationProp === "string") {
    locationProp = parsePath(locationProp); // 解析路径
    /* 
    {
      pathname
      search
      hash
      ...
    }
    */
  }

  let {
    pathname = "/",
    search = "",
    hash = "",
    state = null,
    key = "default",
  } = locationProp;

  // 计算出来的位置对象
  let location = React.useMemo(() => {
    // 脱掉基础名
    let trailingPathname = stripBasename(pathname, basename);

    // +++
    if (trailingPathname == null) {
      return null;
    }

    // +++
    return {
      pathname: trailingPathname,
      search,
      hash,
      state,
      key,
    };
  }, [basename, pathname, search, hash, state, key]);

  warning(
    location != null,
    `<Router basename="${basename}"> is not able to match the URL ` +
      `"${pathname}${search}${hash}" because it does not start with the ` +
      `basename, so the <Router> won't render anything.`
  );

  // +++
  if (location == null) {
    return null;
  }

  return (
    <NavigationContext.Provider value={navigationContext}> {/** 导航上下文 */}
      <LocationContext.Provider /** 位置上下文 */
        children={children}
        value={{ location, navigationType }}
      />
    </NavigationContext.Provider>
  );
}

export interface RoutesProps {
  children?: React.ReactNode;
  location?: Partial<Location> | string;
}

/**
 * A container for a nested tree of <Route> elements that renders the branch
 * that best matches the current location.
 *
 * @see https://reactrouter.com/docs/en/v6/components/routes
 */
export function Routes({
  children,
  location,
}: RoutesProps): React.ReactElement | null { // 路由函数式组件
  let dataRouterContext = React.useContext(DataRouterContext); // 使用数据路由器上下文 // +++
  // When in a DataRouterContext _without_ children, we use the router routes
  // directly.  If we have children, then we're in a descendant tree and we
  // need to use child routes.
  let routes =
    dataRouterContext && !children // 在RouterProvider函数式组件中直接就是<Routes />，所以对于此函数式组件来讲是没有孩子的 // +++
      ? (dataRouterContext.router.routes as DataRouteObject[]) // 那么直接就是路由器对象的routes - 也就是路由器对象中的【数据路由】数组 // +++
      : createRoutesFromChildren(children);
  
  // useRoutes hook
  return useRoutes(routes /** 路由器对象中的数据路由数组 - dataRoutes */, location /** undefined - props中也没有传递location属性，因为上面说了是直接<Routes />的 */);
}

export interface AwaitResolveRenderFunction {
  (data: Awaited<any>): React.ReactElement;
}

export interface AwaitProps {
  children: React.ReactNode | AwaitResolveRenderFunction;
  errorElement?: React.ReactNode;
  resolve: TrackedPromise | any;
}

/**
 * Component to use for rendering lazily loaded data from returning defer()
 * in a loader function
 */
export function Await({ children, errorElement, resolve }: AwaitProps) {
  return (
    <AwaitErrorBoundary resolve={resolve} errorElement={errorElement}>
      <ResolveAwait>{children}</ResolveAwait>
    </AwaitErrorBoundary>
  );
}

type AwaitErrorBoundaryProps = React.PropsWithChildren<{
  errorElement?: React.ReactNode;
  resolve: TrackedPromise | any;
}>;

type AwaitErrorBoundaryState = {
  error: any;
};

enum AwaitRenderStatus {
  pending,
  success,
  error,
}

const neverSettledPromise = new Promise(() => {});

class AwaitErrorBoundary extends React.Component<
  AwaitErrorBoundaryProps,
  AwaitErrorBoundaryState
> {
  constructor(props: AwaitErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error(
      "<Await> caught the following error during render",
      error,
      errorInfo
    );
  }

  render() {
    let { children, errorElement, resolve } = this.props;

    let promise: TrackedPromise | null = null;
    let status: AwaitRenderStatus = AwaitRenderStatus.pending;

    if (!(resolve instanceof Promise)) {
      // Didn't get a promise - provide as a resolved promise
      status = AwaitRenderStatus.success;
      promise = Promise.resolve();
      Object.defineProperty(promise, "_tracked", { get: () => true });
      Object.defineProperty(promise, "_data", { get: () => resolve });
    } else if (this.state.error) {
      // Caught a render error, provide it as a rejected promise
      status = AwaitRenderStatus.error;
      let renderError = this.state.error;
      promise = Promise.reject().catch(() => {}); // Avoid unhandled rejection warnings
      Object.defineProperty(promise, "_tracked", { get: () => true });
      Object.defineProperty(promise, "_error", { get: () => renderError });
    } else if ((resolve as TrackedPromise)._tracked) {
      // Already tracked promise - check contents
      promise = resolve;
      status =
        promise._error !== undefined
          ? AwaitRenderStatus.error
          : promise._data !== undefined
          ? AwaitRenderStatus.success
          : AwaitRenderStatus.pending;
    } else {
      // Raw (untracked) promise - track it
      status = AwaitRenderStatus.pending;
      Object.defineProperty(resolve, "_tracked", { get: () => true });
      promise = resolve.then(
        (data: any) =>
          Object.defineProperty(resolve, "_data", { get: () => data }),
        (error: any) =>
          Object.defineProperty(resolve, "_error", { get: () => error })
      );
    }

    if (
      status === AwaitRenderStatus.error &&
      promise._error instanceof AbortedDeferredError
    ) {
      // Freeze the UI by throwing a never resolved promise
      throw neverSettledPromise;
    }

    if (status === AwaitRenderStatus.error && !errorElement) {
      // No errorElement, throw to the nearest route-level error boundary
      throw promise._error;
    }

    if (status === AwaitRenderStatus.error) {
      // Render via our errorElement
      return <AwaitContext.Provider value={promise} children={errorElement} />;
    }

    if (status === AwaitRenderStatus.success) {
      // Render children with resolved value
      return <AwaitContext.Provider value={promise} children={children} />;
    }

    // Throw to the suspense boundary
    throw promise;
  }
}

/**
 * @private
 * Indirection to leverage useAsyncValue for a render-prop API on <Await>
 */
function ResolveAwait({
  children,
}: {
  children: React.ReactNode | AwaitResolveRenderFunction;
}) {
  let data = useAsyncValue();
  if (typeof children === "function") {
    return children(data);
  }
  return <>{children}</>;
}

///////////////////////////////////////////////////////////////////////////////
// UTILS
///////////////////////////////////////////////////////////////////////////////

/**
 * Creates a route config from a React "children" object, which is usually
 * either a `<Route>` element or an array of them. Used internally by
 * `<Routes>` to create a route config from its children.
 *
 * @see https://reactrouter.com/docs/en/v6/utils/create-routes-from-children
 */
export function createRoutesFromChildren(
  children: React.ReactNode,
  parentPath: number[] = []
): RouteObject[] {
  let routes: RouteObject[] = [];

  React.Children.forEach(children, (element, index) => {
    if (!React.isValidElement(element)) {
      // Ignore non-elements. This allows people to more easily inline
      // conditionals in their route config.
      return;
    }

    if (element.type === React.Fragment) {
      // Transparently support React.Fragment and its children.
      routes.push.apply(
        routes,
        createRoutesFromChildren(element.props.children, parentPath)
      );
      return;
    }

    invariant(
      element.type === Route,
      `[${
        typeof element.type === "string" ? element.type : element.type.name
      }] is not a <Route> component. All component children of <Routes> must be a <Route> or <React.Fragment>`
    );

    invariant(
      !element.props.index || !element.props.children,
      "An index route cannot have child routes."
    );

    let treePath = [...parentPath, index];
    let route: RouteObject = {
      id: element.props.id || treePath.join("-"),
      caseSensitive: element.props.caseSensitive,
      element: element.props.element,
      index: element.props.index,
      path: element.props.path,
      loader: element.props.loader,
      action: element.props.action,
      errorElement: element.props.errorElement,
      hasErrorBoundary: element.props.errorElement != null,
      shouldRevalidate: element.props.shouldRevalidate,
      handle: element.props.handle,
    };

    if (element.props.children) {
      route.children = createRoutesFromChildren(
        element.props.children,
        treePath
      );
    }

    routes.push(route);
  });

  return routes;
}

/**
 * Renders the result of `matchRoutes()` into a React element.
 */
export function renderMatches(
  matches: RouteMatch[] | null
): React.ReactElement | null {
  return _renderMatches(matches);
}

/**
 * @private
 * Walk the route tree and add hasErrorBoundary if it's not provided, so that
 * users providing manual route arrays can just specify errorElement
 */
export function enhanceManualRouteObjects( // 遍历路由树并添加hasErrorBoundary（如果没有提供hasErrorBoundary），以便提供手动路由数组的用户可以只指定errorElement
  routes: RouteObject[]
): RouteObject[] {
  // 遍历
  return routes.map((route) => {
    let routeClone = { ...route }; // 浅拷贝
    // 是否有错误边界
    if (routeClone.hasErrorBoundary == null) {
      routeClone.hasErrorBoundary = routeClone.errorElement != null;
    }
    // 对其孩子再次进行 // +++
    if (routeClone.children) {
      routeClone.children = enhanceManualRouteObjects(routeClone.children); // 递归处理
    }
    // 返回浅拷贝后的对象
    return routeClone;
  });
}

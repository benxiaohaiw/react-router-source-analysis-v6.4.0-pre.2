import * as React from "react";
import type {
  Location,
  ParamParseKey,
  Params,
  Path,
  PathMatch,
  PathPattern,
  Router as RemixRouter,
  To,
} from "@remix-run/router";
import {
  Action as NavigationType,
  invariant,
  isRouteErrorResponse,
  joinPaths,
  matchPath,
  matchRoutes,
  parsePath,
  resolveTo,
  warning,
  UNSAFE_getPathContributingMatches as getPathContributingMatches,
} from "@remix-run/router";

import type {
  NavigateOptions,
  RouteContextObject,
  RouteMatch,
  RouteObject,
  DataRouteMatch,
  RelativeRoutingType,
} from "./context";
import {
  DataRouterContext,
  DataRouterStateContext,
  LocationContext,
  NavigationContext,
  RouteContext,
  RouteErrorContext,
  AwaitContext,
  DataStaticRouterContext,
} from "./context";

/**
 * Returns the full href for the given "to" value. This is useful for building
 * custom links that are also accessible and preserve right-click behavior.
 *
 * @see https://reactrouter.com/docs/en/v6/hooks/use-href
 */
export function useHref(
  to: To,
  { relative }: { relative?: RelativeRoutingType } = {}
): string {
  invariant(
    useInRouterContext(),
    // TODO: This error is probably because they somehow have 2 versions of the
    // router loaded. We can help them understand how to avoid that.
    `useHref() may be used only in the context of a <Router> component.`
  );

  let { basename, navigator } = React.useContext(NavigationContext);
  let { hash, pathname, search } = useResolvedPath(to, { relative });

  let joinedPathname = pathname;

  // If we're operating within a basename, prepend it to the pathname prior
  // to creating the href.  If this is a root navigation, then just use the raw
  // basename which allows the basename to have full control over the presence
  // of a trailing slash on root links
  if (basename !== "/") {
    joinedPathname =
      pathname === "/" ? basename : joinPaths([basename, pathname]);
  }

  return navigator.createHref({ pathname: joinedPathname, search, hash });
}

/**
 * Returns true if this component is a descendant of a <Router>.
 *
 * @see https://reactrouter.com/docs/en/v6/hooks/use-in-router-context
 */
export function useInRouterContext(): boolean {
  return React.useContext(LocationContext) != null;
}

/**
 * Returns the current location object, which represents the current URL in web
 * browsers.
 *
 * Note: If you're using this it may mean you're doing some of your own
 * "routing" in your app, and we'd like to know what your use case is. We may
 * be able to provide something higher-level to better suit your needs.
 *
 * @see https://reactrouter.com/docs/en/v6/hooks/use-location
 */
export function useLocation(): Location { // useLocation hook
  invariant(
    useInRouterContext(),
    // TODO: This error is probably because they somehow have 2 versions of the
    // router loaded. We can help them understand how to avoid that.
    `useLocation() may be used only in the context of a <Router> component.`
  );

  // 使用位置上下文 - 然后取出location属性 // +++
  return React.useContext(LocationContext).location; // 它是在Router函数式组件中提供的值对象中的location属性的 // +++
}

/**
 * Returns the current navigation action which describes how the router came to
 * the current location, either by a pop, push, or replace on the history stack.
 *
 * @see https://reactrouter.com/docs/en/v6/hooks/use-navigation-type
 */
export function useNavigationType(): NavigationType {
  return React.useContext(LocationContext).navigationType;
}

/**
 * Returns true if the URL for the given "to" value matches the current URL.
 * This is useful for components that need to know "active" state, e.g.
 * <NavLink>.
 *
 * @see https://reactrouter.com/docs/en/v6/hooks/use-match
 */
export function useMatch<
  ParamKey extends ParamParseKey<Path>,
  Path extends string
>(pattern: PathPattern<Path> | Path): PathMatch<ParamKey> | null {
  invariant(
    useInRouterContext(),
    // TODO: This error is probably because they somehow have 2 versions of the
    // router loaded. We can help them understand how to avoid that.
    `useMatch() may be used only in the context of a <Router> component.`
  );

  let { pathname } = useLocation();
  return React.useMemo(
    () => matchPath<ParamKey, Path>(pattern, pathname),
    [pathname, pattern]
  );
}

/**
 * The interface for the navigate() function returned from useNavigate().
 */
export interface NavigateFunction {
  (to: To, options?: NavigateOptions): void;
  (delta: number): void;
}

/**
 * 返回用于更改位置的命令式方法。由<Link>使用，但也可由其他元素使用以更改位置。
 * Returns an imperative method for changing the location. Used by <Link>s, but
 * may also be used by other elements to change the location.
 *
 * @see https://reactrouter.com/docs/en/v6/hooks/use-navigate
 */
export function useNavigate(): NavigateFunction { // useNavigate hook
  invariant(
    useInRouterContext(),
    // TODO: This error is probably because they somehow have 2 versions of the
    // router loaded. We can help them understand how to avoid that.
    `useNavigate() may be used only in the context of a <Router> component.`
  );

  let { basename, navigator } = React.useContext(NavigationContext); // 使用【导航上下文】// +++
  let { matches } = React.useContext(RouteContext); // 使用【路由上下文】 // +++
  let { pathname: locationPathname } = useLocation(); // useLocation hook 其实就是使用【位置上下文】然后取出location属性值对象 // +++

  // 先说明一下注意事项：这个matches数组来源于当前使用的【路由上下文】，而这个路由上下文中的提供的值不是固定的（可以参考下面所书写出来的结构）那么所以
  // 这个matches的值就和当前useNavigate hook所在的层次关系是相关联的 - 那么就需要去看这个hook出现在了那一层 - 那么距离这一层最近的祖先【路由上下文】的Provider组件所提供的值对象中的matches数组值就是这里的值啦 ~
  let routePathnamesJson = JSON.stringify(
    getPathContributingMatches(matches).map((match) => match.pathnameBase)
    // getPathContributingMatches: 其实就是过滤出匹配数组中第一个匹配元素还有匹配元素对应的route源对象的path属性值是有的且长度>0的也就是不为空串 // +++
    // 然后映射这些匹配对象的pathnameBase为一个数组
    // 接着使用JSON.stringify函数进行字符串化得到一个json字符串 // +++
  );

  // 活跃ref
  let activeRef = React.useRef(false); // 默认值为false // +++
  // 默认失活状态 // +++

  // useEffect中又更改为true // +++
  React.useEffect(() => { // 千万不要忘记useEffect的create和destroy函数的调用是在postMessage产生的【宏任务】中异步去执行的 - 当然它是在渲染更新dom之后才去异步执行的 // +++
    activeRef.current = true; // 标记为true
    // 激活状态 // +++
  });

  // navigate函数
  let navigate: NavigateFunction = React.useCallback(
    (to: To | number, options: NavigateOptions = {}) => {
      warning(
        activeRef.current,
        `You should call navigate() in a React.useEffect(), not when ` +
          `your component is first rendered.`
      );

      // to: /contacts/蔡文静

      // 若是失活状态则直接return // +++
      if (!activeRef.current) return;

      // to是为数字 - 则直接执行【导航器】的go函数 // +++
      if (typeof to === "number") {
        navigator.go(to);
        return; // return
      }

      // 解析to
      let path = resolveTo(
        to, // /contacts/蔡文静
        JSON.parse(routePathnamesJson), // 一个数组 - 这个数组和当前hook最近的祖先【路由上下文】的Provider组件提供的值对象中的matches属性值有关系的 - 因为它是在上面就直接执行啦 ~
        locationPathname, // 当前location对象中的pathname // +++
        // /contacts/张佳宁
        options.relative === "path" // options对象中的relative（相对）属性值是否为'path'值
        // false
      );
      // +++
      // 主要逻辑就是
      // 对应to若是以/开始的那么直接就是to // +++ 这个要注意的！！！ // +++
      // 若to不是以/开始的那么需要和from进行拼接返回最终的pathname的 // +++
      // 其它对于to支持../ ./等格式语法处理逻辑具体看该函数内部的处理 - 其实也就是拿确定后的from和当前的to进行一个拼接产生最终的pathname路径名的啦 ~
      // +++

      // If we're operating within a basename, prepend it to the pathname prior
      // to handing off to history.  If this is a root navigation, then we
      // navigate to the raw basename which allows the basename to have full
      // control over the presence of a trailing slash on root links
      if (basename !== "/") { // 在Router函数式组件中所提供的值对象中的basename就是/ // +++ 这点要注意！！！
        path.pathname =
          path.pathname === "/"
            ? basename
            : joinPaths([basename, path.pathname]);
      }

      // 这个navigator对象就在Router函数式组件中使用NavigationContext的Provider组件进行提供的
      // 而它又来源于Router组件的属性
      // 而这个属性又是在RouterProvider函数式组件中对Router组件进行传递的navigator这个prop属性的啦 ~
      // 具体看这个RouterProvider组件中所计算出来的navigator对象 // +++

      (!!options.replace /** options中是否有replace参数 */ ? navigator.replace /** 使用replace函数 */ : navigator.push /** 使用push函数 */)(
        path, // 一个对象{pathname: '/contacts/蔡文静', search, hash, ...}
        options.state,
        options
      );
    },
    [basename, navigator, routePathnamesJson, locationPathname]
  );

  // 返回上面的navigate函数 // +++
  return navigate;
}

// 出口上下文
const OutletContext = React.createContext<unknown>(null); // 默认为null

/**
 * Returns the context (if provided) for the child route at this level of the route
 * hierarchy.
 * @see https://reactrouter.com/docs/en/v6/hooks/use-outlet-context
 */
export function useOutletContext<Context = unknown>(): Context {
  return React.useContext(OutletContext) as Context;
}

/**
 * Returns the element for the child route at this level of the route
 * hierarchy. Used internally by <Outlet> to render child routes.
 *
 * @see https://reactrouter.com/docs/en/v6/hooks/use-outlet
 */
export function useOutlet(context?: unknown): React.ReactElement | null { // useOutlet hook
  let outlet = React.useContext(RouteContext).outlet; // 直接使用路由上下文，然后取出outlet属性值
  
  // +++
  if (outlet) {
    return (
      // 出口上下文提供这个context值 // 但是它是undefined
      <OutletContext.Provider value={context}>{outlet}</OutletContext.Provider> // 直接渲染outlet元素 - 也就是匹配到的后一个match对象对应的route对象的element元素 // +++
    );
  }
  return outlet;
}

/**
 * Returns an object of key/value pairs of the dynamic params from the current
 * URL that were matched by the route path.
 *
 * @see https://reactrouter.com/docs/en/v6/hooks/use-params
 */
export function useParams<
  ParamsOrKey extends string | Record<string, string | undefined> = string
>(): Readonly<
  [ParamsOrKey] extends [string] ? Params<ParamsOrKey> : Partial<ParamsOrKey>
> {
  let { matches } = React.useContext(RouteContext);
  let routeMatch = matches[matches.length - 1];
  return routeMatch ? (routeMatch.params as any) : {};
}

/**
 * Resolves the pathname of the given `to` value against the current location.
 *
 * @see https://reactrouter.com/docs/en/v6/hooks/use-resolved-path
 */
export function useResolvedPath(
  to: To,
  { relative }: { relative?: RelativeRoutingType } = {}
): Path {
  let { matches } = React.useContext(RouteContext);
  let { pathname: locationPathname } = useLocation();

  let routePathnamesJson = JSON.stringify(
    getPathContributingMatches(matches).map((match) => match.pathnameBase)
  );

  return React.useMemo(
    () =>
      resolveTo(
        to,
        JSON.parse(routePathnamesJson),
        locationPathname,
        relative === "path"
      ),
    [to, routePathnamesJson, locationPathname, relative]
  );
}

/**
 * Returns the element of the route that matched the current location, prepared
 * with the correct context to render the remainder of the route tree. Route
 * elements in the tree must render an <Outlet> to render their child route's
 * element.
 *
 * @see https://reactrouter.com/docs/en/v6/hooks/use-routes
 */
export function useRoutes(
  routes: RouteObject[],
  locationArg?: Partial<Location> | string
): React.ReactElement | null { // useRoutes hook
  invariant(
    useInRouterContext(),
    // TODO: This error is probably because they somehow have 2 versions of the
    // router loaded. We can help them understand how to avoid that.
    `useRoutes() may be used only in the context of a <Router> component.`
  );

  let dataRouterStateContext = React.useContext(DataRouterStateContext); // 使用数据路由器状态上下文
  let { matches: parentMatches /** 默认值为一个空数组 [] */ } = React.useContext(RouteContext); // 使用路由上下文

  // 路由匹配
  // +++
  let routeMatch = parentMatches[parentMatches.length - 1]; // undefined

  // +++
  let parentParams = routeMatch ? routeMatch.params : {}; // {}
  let parentPathname = routeMatch ? routeMatch.pathname : "/"; // /
  let parentPathnameBase = routeMatch ? routeMatch.pathnameBase : "/"; // /

  // +++
  let parentRoute = routeMatch && routeMatch.route; // undefined

  if (__DEV__) {
    // You won't get a warning about 2 different <Routes> under a <Route>
    // without a trailing *, but this is a best-effort warning anyway since we
    // cannot even give the warning unless they land at the parent route.
    //
    // Example:
    //
    // <Routes>
    //   {/* This route path MUST end with /* because otherwise
    //       it will never match /blog/post/123 */}
    //   <Route path="blog" element={<Blog />} />
    //   <Route path="blog/feed" element={<BlogFeed />} />
    // </Routes>
    //
    // function Blog() {
    //   return (
    //     <Routes>
    //       <Route path="post/:id" element={<Post />} />
    //     </Routes>
    //   );
    // }
    let parentPath = (parentRoute && parentRoute.path) || "";
    warningOnce(
      parentPathname,
      !parentRoute || parentPath.endsWith("*"),
      `You rendered descendant <Routes> (or called \`useRoutes()\`) at ` +
        `"${parentPathname}" (under <Route path="${parentPath}">) but the ` +
        `parent route path has no trailing "*". This means if you navigate ` +
        `deeper, the parent won't match anymore and therefore the child ` +
        `routes will never render.\n\n` +
        `Please change the parent <Route path="${parentPath}"> to <Route ` +
        `path="${parentPath === "/" ? "*" : `${parentPath}/*`}">.`
    );
  }

  // useLocation hook
  let locationFromContext = useLocation(); // 其实就是使用LocationContext，然后取location属性
  // +++
  // 就是在Router函数式组件中计算出来的location对象 // +++

  let location;
  if (locationArg /** undefined */) {
    let parsedLocationArg =
      typeof locationArg === "string" ? parsePath(locationArg) : locationArg;

    invariant(
      parentPathnameBase === "/" ||
        parsedLocationArg.pathname?.startsWith(parentPathnameBase),
      `When overriding the location using \`<Routes location>\` or \`useRoutes(routes, location)\`, ` +
        `the location pathname must begin with the portion of the URL pathname that was ` +
        `matched by all parent routes. The current pathname base is "${parentPathnameBase}" ` +
        `but pathname "${parsedLocationArg.pathname}" was given in the \`location\` prop.`
    );

    location = parsedLocationArg;
  } else {
    location = locationFromContext; // 赋值为上面的那个location对象 // +++
  }

  let pathname = location.pathname || "/"; // 当前的路径名

  // 剩余路径名
  let remainingPathname =
    parentPathnameBase === "/" // 是/
      ? pathname // 那么直接路径名
      : pathname.slice(parentPathnameBase.length) /** 跳过基础 */ || "/"; // +++

  // +++
  // 再一次执行【匹配路由】函数 // +++
  // 得到匹配结果数组 - 是经过扁平化后的 // +++
  let matches = matchRoutes(routes /** 路由器对象中的数据路由dataRoutes */, { pathname: remainingPathname /** 当前的路径名 */ } /** 传递的location对象 */);

  if (__DEV__) {
    warning(
      parentRoute || matches != null,
      `No routes matched location "${location.pathname}${location.search}${location.hash}" `
    );

    warning(
      matches == null ||
        matches[matches.length - 1].route.element !== undefined,
      `Matched leaf route at location "${location.pathname}${location.search}${location.hash}" does not have an element. ` +
        `This means it will render an <Outlet /> with a null value by default resulting in an "empty" page.`
    );
  }

  // 渲染匹配 // +++
  let renderedMatches = _renderMatches(
    matches &&
      // 映射一遍 - 目的就是和这里的parentXxx进行合并或者是拼接的 // +++
      matches.map((match) =>
        // 合并每一个匹配元素 // +++
        // 其实就是和这里的parentXxx进行合并或者是拼接的 // +++
        Object.assign({}, match, {
          params: Object.assign({}, parentParams, match.params), // 与父合并
          pathname: joinPaths([parentPathnameBase, match.pathname]), // 与父拼接
          pathnameBase:
            match.pathnameBase === "/"
              ? parentPathnameBase // 父
              : joinPaths([parentPathnameBase, match.pathnameBase]), // 与父拼接
        })
      ),
    parentMatches, // 默认值空数组
    dataRouterStateContext /** 数据路由器状态上下文 */ || undefined
  );

  // When a user passes in a `locationArg`, the associated routes need to
  // be wrapped in a new `LocationContext.Provider` in order for `useLocation`
  // to use the scoped location instead of the global location.
  if (locationArg && renderedMatches) {
    return (
      <LocationContext.Provider
        value={{
          location: {
            pathname: "/",
            search: "",
            hash: "",
            state: null,
            key: "default",
            ...location,
          },
          navigationType: NavigationType.Pop,
        }}
      >
        {renderedMatches}
      </LocationContext.Provider>
    );
  }

  // +++
  // 返回渲染匹配结果 // +++ 也就是组合后的元素交给react进行渲染 // +++
  return renderedMatches;
}
// https://reactrouter.com/en/main/start/tutorial
/* 
/contacts/张佳宁

matches: [
  {
    params: {
      contactId: '张佳宁'
    },
    pathname: '/',
    pathnameBase: '/',
    route源对象
  },
  {
    params: {
      contactId: '张佳宁'
    },
    pathname: '/contacts/张佳宁',
    pathnameBase: '/contacts/张佳宁',
    route源对象
  }
]
倒序进行 - 后一个则需要作为前一个的outlet（出口）

renderedMatches:
<RenderErrorBoundary
  location={dataRouterState.location}
  component={errorElement}
  error={error}
  children={getChildren()}
/>

|
\/

<RenderErrorBoundary
  location={dataRouterState.location}
  component={errorElement}
  error={error}
  children={
    <RenderedRoute
      match={match Root}
      routeContext={{
        outlet: (<RenderedRoute
          match={match Contact}
          routeContext={{
            outlet: null,
            matches: [match Root, match Contact],
          }}
        >
          {match Contact.route.element}
        </RenderedRoute>),
        matches: [match Root],
      }}
    >
      {match Root.route.element}
    </RenderedRoute>
  }
/>

|
\/

children={
  <RouteContext.Provider
    value={{
      outlet: (
        <RouteContext.Provider
          value={{
            outlet: null,
            matches: [match Root, match Contact],
          }}
        >
          {match Contact.route.element} // <Contact /> // +++
        </<RouteContext.Provider>
      ),
      matches: [match Root],
    }}
  >
    {match Root.route.element} // <Root /> -> 直接使用<Outlet />组件 - 那么具体查看Outlet函数式组件内部其实使用了useOutlet hook再然后就是使用了RouteContext，取出outlet属性值作为孩子children进行渲染 // +++
    // +++
  </RouteContext.Provider>
}
// 这个就是_renderMatches函数内使用数组的reduceRight函数所形成的最终结构就是这样的啦 ~

// ===

<RouterProvider router={router} />

|
\/

<DataRouterContext.Provider
  value={{
    ...
  }}
>
  <DataRouterStateContext.Provider
    value={{
      ...
    }}
  >
    <Router // 下面说的是这里
      ...
    >
      <Routes />
    </Router>
  </DataRouterStateContext.Provider>
</<DataRouterContext.Provider>

|
\/

<NavigationContext.Provider // 这个是Router函数式组件内部 // +++
  value={{
    ...
  }}
>
  <LocationContext.Provider
    value={{
      ...
    }}
    children={
      <Routes /> // 下面说的是这个
    }
  >
  </LocationContext.Provider>
</NavigationContext.Provider>

|
\/

useRoutes hook

|
\/

那么就是最上方的renderedMatches值，也就是RenderErrorBoundary类组件啦:) ~
*/

function DefaultErrorElement() {
  let error = useRouteError();
  let message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
    ? error.message
    : JSON.stringify(error);
  let stack = error instanceof Error ? error.stack : null;
  let lightgrey = "rgba(200,200,200, 0.5)";
  let preStyles = { padding: "0.5rem", backgroundColor: lightgrey };
  let codeStyles = { padding: "2px 4px", backgroundColor: lightgrey };
  return (
    <>
      <h2>Unhandled Thrown Error!</h2>
      <h3 style={{ fontStyle: "italic" }}>{message}</h3>
      {stack ? <pre style={preStyles}>{stack}</pre> : null}
      <p>💿 Hey developer 👋</p>
      <p>
        You can provide a way better UX than this when your app throws errors by
        providing your own&nbsp;
        <code style={codeStyles}>errorElement</code> props on&nbsp;
        <code style={codeStyles}>&lt;Route&gt;</code>
      </p>
    </>
  );
}

type RenderErrorBoundaryProps = React.PropsWithChildren<{
  location: Location;
  error: any;
  component: React.ReactNode;
}>;

type RenderErrorBoundaryState = {
  location: Location;
  error: any;
};

export class RenderErrorBoundary extends React.Component<
  RenderErrorBoundaryProps,
  RenderErrorBoundaryState
> {
  constructor(props: RenderErrorBoundaryProps) {
    super(props);
    this.state = {
      location: props.location,
      error: props.error,
    };
  }

  static getDerivedStateFromError(error: any) {
    return { error: error };
  }

  static getDerivedStateFromProps(
    props: RenderErrorBoundaryProps,
    state: RenderErrorBoundaryState
  ) {
    // When we get into an error state, the user will likely click "back" to the
    // previous page that didn't have an error. Because this wraps the entire
    // application, that will have no effect--the error page continues to display.
    // This gives us a mechanism to recover from the error when the location changes.
    //
    // Whether we're in an error state or not, we update the location in state
    // so that when we are in an error state, it gets reset when a new location
    // comes in and the user recovers from the error.
    if (state.location !== props.location) {
      return {
        error: props.error,
        location: props.location,
      };
    }

    // If we're not changing locations, preserve the location but still surface
    // any new errors that may come through. We retain the existing error, we do
    // this because the error provided from the app state may be cleared without
    // the location changing.
    return {
      error: props.error || state.error,
      location: state.location,
    };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error(
      "React Router caught the following error during render",
      error,
      errorInfo
    );
  }

  render() {
    return this.state.error ? (
      <RouteErrorContext.Provider
        value={this.state.error}
        children={this.props.component}
      />
    ) : (
      this.props.children
    );
  }
}

interface RenderedRouteProps {
  routeContext: RouteContextObject;
  match: RouteMatch<string, RouteObject>;
  children: React.ReactNode | null;
}

// 渲染路由函数式组件
function RenderedRoute({ routeContext, match, children }: RenderedRouteProps) {
  let dataStaticRouterContext = React.useContext(DataStaticRouterContext); // 使用数据静态路由器上下文 // +++
  // 默认值是一个null值的 // +++

  // Track how deep we got in our render pass to emulate SSR componentDidCatch
  // in a DataStaticRouter
  if (dataStaticRouterContext && match.route.errorElement) {
    dataStaticRouterContext._deepestRenderedBoundaryId = match.route.id;
  }

  return ( // 这里使用路由上下文提供者提供这个路由上下文对象 // +++
    <RouteContext.Provider value={routeContext}> {/** 路由上下文提供值对象 // +++ */}
      {children /** 直接渲染孩子children */}
    </RouteContext.Provider>
  );
}

// 渲染匹配
export function _renderMatches(
  matches: RouteMatch[] | null,
  parentMatches: RouteMatch[] = [],
  dataRouterState?: RemixRouter["state"]
): React.ReactElement | null {
  if (matches == null) {
    if (dataRouterState?.errors) {
      // Don't bail if we have data router errors so we can render them in the
      // boundary.  Use the pre-matched (or shimmed) matches
      matches = dataRouterState.matches as DataRouteMatch[];
    } else {
      return null;
    }
  }

  let renderedMatches = matches;

  // If we have data errors, trim matches to the highest error boundary
  let errors = dataRouterState?.errors;
  if (errors != null) {
    let errorIndex = renderedMatches.findIndex(
      (m) => m.route.id && errors?.[m.route.id]
    );
    invariant(
      errorIndex >= 0,
      `Could not find a matching route for the current errors: ${errors}`
    );
    renderedMatches = renderedMatches.slice(
      0,
      Math.min(renderedMatches.length, errorIndex + 1)
    );
  }

  // reduceRight
  // 对于数组中的元素【倒序遍历】 - 【后一个元素则作为前一个元素的outlet】 // +++ 重点 // +++
  return renderedMatches.reduceRight((outlet, match, index) => {
    let error = match.route.id ? errors?.[match.route.id] : null;
    // Only data routers handle errors
    let errorElement = dataRouterState
      ? match.route.errorElement || <DefaultErrorElement /> // 默认错误元素
      : null;
    // 获取孩子函数 // +++
    let getChildren = () => (
      // 渲染路由函数式组件
      <RenderedRoute
        match={match} // match对象
        // 提供的【路由上下文对象】 // +++
        routeContext={{
          outlet, // outlet值 - 后一个元素作为这里的元素的outlet // ++++++ 格外注意这个！！！
          // 父匹配拼接（目前为空数组）【包含自身match对象的前部分数组】使用的是concat会形成新的数组引用（这里要注意！！！） // +++
          matches: parentMatches.concat(renderedMatches.slice(0, index + 1)),
        }}
      >
        {error
          ? errorElement // 有错误就显示错误元素
          : match.route.element !== undefined
          ? match.route.element // 需要渲染的元素直接作为孩子 // ++++++ 格外注意这个！！！
          : outlet}
      </RenderedRoute>
    );
    // Only wrap in an error boundary within data router usages when we have an
    // errorElement on this route.  Otherwise let it bubble up to an ancestor
    // errorElement
    return dataRouterState /** 数据路由器状态上下文 */ && (match.route.errorElement || index === 0) /** 路由有错误元素 或 当前遍历下标index为0也就是遍历到了第一个元素了 */ ? (
      // 使用渲染错误边界【类式组件】进行包裹 // +++
      <RenderErrorBoundary
        location={dataRouterState.location} // 数据路由器状态上下文对象中的location属性值
        component={errorElement} // 错误元素 // +++
        error={error} // 
        children={getChildren()} // 孩子 // +++
      />
    ) : (
      getChildren() // 直接执行获取孩子函数
    );
  }, null as React.ReactElement | null); // 初始outlet为null // +++
}

enum DataRouterHook {
  UseRevalidator = "useRevalidator",
}

enum DataRouterStateHook {
  UseLoaderData = "useLoaderData",
  UseActionData = "useActionData",
  UseRouteError = "useRouteError",
  UseNavigation = "useNavigation",
  UseRouteLoaderData = "useRouteLoaderData",
  UseMatches = "useMatches",
  UseRevalidator = "useRevalidator",
}

function getDataRouterConsoleError(
  hookName: DataRouterHook | DataRouterStateHook
) {
  return `${hookName} must be used within a data router.  See https://reactrouter.com/en/main/routers/picking-a-router.`;
}

function useDataRouterContext(hookName: DataRouterHook) {
  let ctx = React.useContext(DataRouterContext);
  invariant(ctx, getDataRouterConsoleError(hookName));
  return ctx;
}

function useDataRouterState(hookName: DataRouterStateHook) {
  let state = React.useContext(DataRouterStateContext);
  invariant(state, getDataRouterConsoleError(hookName));
  return state;
}

/**
 * Returns the current navigation, defaulting to an "idle" navigation when
 * no navigation is in progress
 */
export function useNavigation() {
  let state = useDataRouterState(DataRouterStateHook.UseNavigation);
  return state.navigation;
}

/**
 * Returns a revalidate function for manually triggering revalidation, as well
 * as the current state of any manual revalidations
 */
export function useRevalidator() {
  let dataRouterContext = useDataRouterContext(DataRouterHook.UseRevalidator);
  let state = useDataRouterState(DataRouterStateHook.UseRevalidator);
  return {
    revalidate: dataRouterContext.router.revalidate,
    state: state.revalidation,
  };
}

/**
 * Returns the active route matches, useful for accessing loaderData for
 * parent/child routes or the route "handle" property
 */
export function useMatches() {
  let { matches, loaderData } = useDataRouterState(
    DataRouterStateHook.UseMatches
  );
  return React.useMemo(
    () =>
      matches.map((match) => {
        let { pathname, params } = match;
        // Note: This structure matches that created by createUseMatchesMatch
        // in the @remix-run/router , so if you change this please also change
        // that :)  Eventually we'll DRY this up
        return {
          id: match.route.id,
          pathname,
          params,
          data: loaderData[match.route.id] as unknown,
          handle: match.route.handle as unknown,
        };
      }),
    [matches, loaderData]
  );
}

/**
 * Returns the loader data for the nearest ancestor Route loader
 */
export function useLoaderData(): unknown {
  let state = useDataRouterState(DataRouterStateHook.UseLoaderData);

  let route = React.useContext(RouteContext);
  invariant(route, `useLoaderData must be used inside a RouteContext`);

  let thisRoute = route.matches[route.matches.length - 1];
  invariant(
    thisRoute.route.id,
    `useLoaderData can only be used on routes that contain a unique "id"`
  );

  return state.loaderData[thisRoute.route.id];
}

/**
 * Returns the loaderData for the given routeId
 */
export function useRouteLoaderData(routeId: string): unknown {
  let state = useDataRouterState(DataRouterStateHook.UseRouteLoaderData);
  return state.loaderData[routeId];
}

/**
 * Returns the action data for the nearest ancestor Route action
 */
export function useActionData(): unknown {
  let state = useDataRouterState(DataRouterStateHook.UseActionData);

  let route = React.useContext(RouteContext);
  invariant(route, `useActionData must be used inside a RouteContext`);

  return Object.values(state?.actionData || {})[0];
}

/**
 * Returns the nearest ancestor Route error, which could be a loader/action
 * error or a render error.  This is intended to be called from your
 * errorElement to display a proper error message.
 */
export function useRouteError(): unknown {
  let error = React.useContext(RouteErrorContext);
  let state = useDataRouterState(DataRouterStateHook.UseRouteError);
  let route = React.useContext(RouteContext);
  let thisRoute = route.matches[route.matches.length - 1];

  // If this was a render error, we put it in a RouteError context inside
  // of RenderErrorBoundary
  if (error) {
    return error;
  }

  invariant(route, `useRouteError must be used inside a RouteContext`);
  invariant(
    thisRoute.route.id,
    `useRouteError can only be used on routes that contain a unique "id"`
  );

  // Otherwise look for errors from our data router state
  return state.errors?.[thisRoute.route.id];
}

/**
 * Returns the happy-path data from the nearest ancestor <Await /> value
 */
export function useAsyncValue(): unknown {
  let value = React.useContext(AwaitContext);
  return value?._data;
}

/**
 * Returns the error from the nearest ancestor <Await /> value
 */
export function useAsyncError(): unknown {
  let value = React.useContext(AwaitContext);
  return value?._error;
}

const alreadyWarned: Record<string, boolean> = {};

function warningOnce(key: string, cond: boolean, message: string) {
  if (!cond && !alreadyWarned[key]) {
    alreadyWarned[key] = true;
    warning(false, message);
  }
}

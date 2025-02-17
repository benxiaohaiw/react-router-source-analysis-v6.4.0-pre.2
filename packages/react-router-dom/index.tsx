/**
 * NOTE: If you refactor this to split up the modules into separate files,
 * you'll need to update the rollup config for react-router-dom-v5-compat.
 */
import * as React from "react";
import type {
  NavigateOptions,
  RelativeRoutingType,
  RouteObject,
  To,
} from "react-router";
import {
  Router,
  createPath,
  useHref,
  useLocation,
  useMatch,
  useMatches,
  useNavigate,
  useNavigation,
  useResolvedPath,
  UNSAFE_DataRouterContext as DataRouterContext,
  UNSAFE_DataRouterStateContext as DataRouterStateContext,
  UNSAFE_NavigationContext as NavigationContext,
  UNSAFE_RouteContext as RouteContext,
  UNSAFE_enhanceManualRouteObjects as enhanceManualRouteObjects,
} from "react-router";
import type {
  BrowserHistory,
  Fetcher,
  FormEncType,
  FormMethod,
  GetScrollRestorationKeyFunction,
  HashHistory,
  History,
  HydrationState,
  Router as RemixRouter,
} from "@remix-run/router";
import {
  createRouter,
  createBrowserHistory,
  createHashHistory,
  invariant,
  joinPaths,
  matchPath,
} from "@remix-run/router";

import type {
  SubmitOptions,
  ParamKeyValuePair,
  URLSearchParamsInit,
} from "./dom";
import {
  createSearchParams,
  defaultMethod,
  getFormSubmissionInfo,
  getSearchParamsForLocation,
  shouldProcessLinkClick,
} from "./dom";

////////////////////////////////////////////////////////////////////////////////
//#region Re-exports
////////////////////////////////////////////////////////////////////////////////

export type {
  FormEncType,
  FormMethod,
  ParamKeyValuePair,
  SubmitOptions,
  URLSearchParamsInit,
};
export { createSearchParams };

// Note: Keep in sync with react-router exports!
export type {
  ActionFunction,
  ActionFunctionArgs,
  AwaitProps,
  DataRouteMatch,
  DataRouteObject,
  Fetcher,
  Hash,
  IndexRouteObject,
  IndexRouteProps,
  JsonFunction,
  LayoutRouteProps,
  LoaderFunction,
  LoaderFunctionArgs,
  Location,
  MemoryRouterProps,
  NavigateFunction,
  NavigateOptions,
  NavigateProps,
  Navigation,
  Navigator,
  NonIndexRouteObject,
  OutletProps,
  Params,
  ParamParseKey,
  Path,
  PathMatch,
  Pathname,
  PathPattern,
  PathRouteProps,
  RedirectFunction,
  RelativeRoutingType,
  RouteMatch,
  RouteObject,
  RouteProps,
  RouterProps,
  RouterProviderProps,
  RoutesProps,
  Search,
  ShouldRevalidateFunction,
  To,
} from "react-router";
export {
  AbortedDeferredError,
  Await,
  MemoryRouter,
  Navigate,
  NavigationType,
  Outlet,
  Route,
  Router,
  RouterProvider,
  Routes,
  createMemoryRouter,
  createPath,
  createRoutesFromChildren,
  createRoutesFromElements,
  defer,
  isRouteErrorResponse,
  generatePath,
  json,
  matchPath,
  matchRoutes,
  parsePath,
  redirect,
  renderMatches,
  resolvePath,
  useActionData,
  useAsyncError,
  useAsyncValue,
  useHref,
  useInRouterContext,
  useLoaderData,
  useLocation,
  useMatch,
  useMatches,
  useNavigate,
  useNavigation,
  useNavigationType,
  useOutlet,
  useOutletContext,
  useParams,
  useResolvedPath,
  useRevalidator,
  useRouteError,
  useRouteLoaderData,
  useRoutes,
} from "react-router";

///////////////////////////////////////////////////////////////////////////////
// DANGER! PLEASE READ ME!
// We provide these exports as an escape hatch in the event that you need any
// routing data that we don't provide an explicit API for. With that said, we
// want to cover your use case if we can, so if you feel the need to use these
// we want to hear from you. Let us know what you're building and we'll do our
// best to make sure we can support you!
//
// We consider these exports an implementation detail and do not guarantee
// against any breaking changes, regardless of the semver release. Use with
// extreme caution and only if you understand the consequences. Godspeed.
///////////////////////////////////////////////////////////////////////////////

/** @internal */
export {
  UNSAFE_DataRouterContext,
  UNSAFE_DataRouterStateContext,
  UNSAFE_DataStaticRouterContext,
  UNSAFE_NavigationContext,
  UNSAFE_LocationContext,
  UNSAFE_RouteContext,
  UNSAFE_enhanceManualRouteObjects,
} from "react-router";
//#endregion

declare global {
  var __staticRouterHydrationData: HydrationState | undefined; // 下面在使用的地方是window?.__staticRouterHydrationData - 那么所以以后再使用ts的话对于window上的属性可以
  // 参考这里的这个 // +++
}

////////////////////////////////////////////////////////////////////////////////
//#region Routers
////////////////////////////////////////////////////////////////////////////////

/* 
const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: 'contacts/:contactId',
        element: <Contact />,
      },
      {
        path: 'contacts/:contactId/edit',
        element: <EditContact />,
      },
    ],
  },
  {
    path: '/login',
    element: <Login />,
  },
])
*/
/* 
const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      {
        path: 'a',
        element: <A />,
        children: [
          {
            path: 'b/:xxx',
            element: <B />,
          }
        ]
      },
      {
        path: 'c',
        element: <C />,
      },
    ],
  },
  {
    path: '/d',
    element: <D />,
  },
])
*/
// 创建浏览器路由器 // +++
export function createBrowserRouter(
  routes: RouteObject[],
  opts?: {
    basename?: string;
    hydrationData?: HydrationState;
    window?: Window;
  }
): RemixRouter {
  // 创建路由器 // +++
  // benxiaohaiw/react-router-source-analysis-v6.4.0-pre.2/packages/router/router.ts下的createRouter函数 // +++
  return createRouter({
    basename: opts?.basename, // 基础名字
    // benxiaohaiw/react-router-source-analysis-v6.4.0-pre.2/packages/router/history.ts下的createBrowserHistory函数
    history: createBrowserHistory({ window: opts?.window }), // 创建浏览器history对象
    hydrationData: opts?.hydrationData || window?.__staticRouterHydrationData, // 混合数据
    // benxiaohaiw/react-router-source-analysis-v6.4.0-pre.2/packages/react-router/lib/components.tsx下的enhanceManualRouteObjects函数
    routes: enhanceManualRouteObjects(routes), // 路由 - 增强手动路由对象 - 仅仅只是对每个路由route进行浅拷贝 且 处理它们的hasErrorBoundary属性是true还是false，这个值根据route的errorElement是否!=null
  }).initialize(); // 初始化
  // 紧接着执行initialize函数 // +++
  /// 主要就是监听popstate事件 - 其它逻辑具体看initialize函数 // +++
}

export function createHashRouter(
  routes: RouteObject[],
  opts?: {
    basename?: string;
    hydrationData?: HydrationState;
    window?: Window;
  }
): RemixRouter {
  return createRouter({
    basename: opts?.basename,
    history: createHashHistory({ window: opts?.window }),
    hydrationData: opts?.hydrationData || window?.__staticRouterHydrationData,
    routes: enhanceManualRouteObjects(routes),
  }).initialize();
}
//#endregion

////////////////////////////////////////////////////////////////////////////////
//#region Components
////////////////////////////////////////////////////////////////////////////////

export interface BrowserRouterProps {
  basename?: string;
  children?: React.ReactNode;
  window?: Window;
}

/**
 * A `<Router>` for use in web browsers. Provides the cleanest URLs.
 */
export function BrowserRouter({
  basename,
  children,
  window,
}: BrowserRouterProps) {
  let historyRef = React.useRef<BrowserHistory>();
  if (historyRef.current == null) {
    historyRef.current = createBrowserHistory({ window, v5Compat: true });
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

export interface HashRouterProps {
  basename?: string;
  children?: React.ReactNode;
  window?: Window;
}

/**
 * A `<Router>` for use in web browsers. Stores the location in the hash
 * portion of the URL so it is not sent to the server.
 */
export function HashRouter({ basename, children, window }: HashRouterProps) {
  let historyRef = React.useRef<HashHistory>();
  if (historyRef.current == null) {
    historyRef.current = createHashHistory({ window, v5Compat: true });
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

export interface HistoryRouterProps {
  basename?: string;
  children?: React.ReactNode;
  history: History;
}

/**
 * A `<Router>` that accepts a pre-instantiated history object. It's important
 * to note that using your own history object is highly discouraged and may add
 * two versions of the history library to your bundles unless you use the same
 * version of the history library that React Router uses internally.
 */
function HistoryRouter({ basename, children, history }: HistoryRouterProps) {
  const [state, setState] = React.useState({
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

if (__DEV__) {
  HistoryRouter.displayName = "unstable_HistoryRouter";
}

export { HistoryRouter as unstable_HistoryRouter };

export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  reloadDocument?: boolean;
  replace?: boolean;
  state?: any;
  preventScrollReset?: boolean;
  relative?: RelativeRoutingType;
  to: To;
}

/**
 * The public API for rendering a history-aware <a>.
 */
export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>( // Link组件
  function LinkWithRef(
    {
      onClick,
      relative,
      reloadDocument,
      replace,
      state,
      target,
      to, // /contacts/蔡文静
      preventScrollReset,
      ...rest
    },
    ref
  ) {
    let href = useHref(to, { relative });

    // 执行useLinkClickHandler hook返回一个【内部onClick】函数 // +++
    let internalOnClick = useLinkClickHandler(to /** /contacts/蔡文静 */, {
      replace,
      state,
      target,
      preventScrollReset,
      relative,
    });
    
    // 处理点击事件
    function handleClick(
      event: React.MouseEvent<HTMLAnchorElement, MouseEvent>
    ) {
      if (onClick) onClick(event); // 执行onClick属性函数
      if (!event.defaultPrevented) { // 没有
        internalOnClick(event); // 执行【内部onClick】函数 // +++
      }
    }

    // 所以实际上这里a标签的点击最终会执行useNavigate hook执行后返回的这个navigate函数 - 而这个navigate函数最终又会去执行router.navigate函数 - 而这个函数内又去执行 -> 
    // 【开始导航】函数 -> 【完成导航】函数 -> updateState（内部一一去执行router下的subscribers集合中的subscriber函数其实也就是在RouterProvider函数式组件中使用useSyncExternalStoreShim hook - 
    // 导致react把内部的handleStoreChange（包括forceUpdate）作为函数存入到当前的subscribers集合中，所以这里执行也就是handleStoreChange函数的执行啦 ~ 最终就会引起强制更新啦 ~） // +++

    return (
      // eslint-disable-next-line jsx-a11y/anchor-has-content
      <a // 直接就是一个a标签 // +++
        {...rest}
        href={href}
        onClick={reloadDocument ? onClick : handleClick} // click事件监听函数
        ref={ref}
        target={target}
      />
    );
  }
);

if (__DEV__) {
  Link.displayName = "Link";
}

export interface NavLinkProps
  extends Omit<LinkProps, "className" | "style" | "children"> {
  children?:
    | React.ReactNode
    | ((props: { isActive: boolean; isPending: boolean }) => React.ReactNode);
  caseSensitive?: boolean;
  className?:
    | string
    | ((props: {
        isActive: boolean;
        isPending: boolean;
      }) => string | undefined);
  end?: boolean;
  style?:
    | React.CSSProperties
    | ((props: {
        isActive: boolean;
        isPending: boolean;
      }) => React.CSSProperties | undefined);
}

/**
 * A <Link> wrapper that knows if it's "active" or not.
 */
export const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>(
  function NavLinkWithRef(
    {
      "aria-current": ariaCurrentProp = "page",
      caseSensitive = false,
      className: classNameProp = "",
      end = false,
      style: styleProp,
      to,
      children,
      ...rest
    },
    ref
  ) {
    let path = useResolvedPath(to, { relative: rest.relative });
    let location = useLocation();
    let routerState = React.useContext(DataRouterStateContext);

    let toPathname = path.pathname;
    let locationPathname = location.pathname;
    let nextLocationPathname =
      routerState && routerState.navigation && routerState.navigation.location
        ? routerState.navigation.location.pathname
        : null;

    if (!caseSensitive) {
      locationPathname = locationPathname.toLowerCase();
      nextLocationPathname = nextLocationPathname
        ? nextLocationPathname.toLowerCase()
        : null;
      toPathname = toPathname.toLowerCase();
    }

    let isActive =
      locationPathname === toPathname ||
      (!end &&
        locationPathname.startsWith(toPathname) &&
        locationPathname.charAt(toPathname.length) === "/");

    let isPending =
      nextLocationPathname != null &&
      (nextLocationPathname === toPathname ||
        (!end &&
          nextLocationPathname.startsWith(toPathname) &&
          nextLocationPathname.charAt(toPathname.length) === "/"));

    let ariaCurrent = isActive ? ariaCurrentProp : undefined;

    let className: string | undefined;
    if (typeof classNameProp === "function") {
      className = classNameProp({ isActive, isPending });
    } else {
      // If the className prop is not a function, we use a default `active`
      // class for <NavLink />s that are active. In v5 `active` was the default
      // value for `activeClassName`, but we are removing that API and can still
      // use the old default behavior for a cleaner upgrade path and keep the
      // simple styling rules working as they currently do.
      className = [
        classNameProp,
        isActive ? "active" : null,
        isPending ? "pending" : null,
      ]
        .filter(Boolean)
        .join(" ");
    }

    let style =
      typeof styleProp === "function"
        ? styleProp({ isActive, isPending })
        : styleProp;

    return (
      <Link
        {...rest}
        aria-current={ariaCurrent}
        className={className}
        ref={ref}
        style={style}
        to={to}
      >
        {typeof children === "function"
          ? children({ isActive, isPending })
          : children}
      </Link>
    );
  }
);

if (__DEV__) {
  NavLink.displayName = "NavLink";
}

export interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  /**
   * The HTTP verb to use when the form is submit. Supports "get", "post",
   * "put", "delete", "patch".
   */
  method?: FormMethod;

  /**
   * Normal `<form action>` but supports React Router's relative paths.
   */
  action?: string;

  /**
   * Forces a full document navigation instead of a fetch.
   */
  reloadDocument?: boolean;

  /**
   * Replaces the current entry in the browser history stack when the form
   * navigates. Use this if you don't want the user to be able to click "back"
   * to the page with the form on it.
   */
  replace?: boolean;

  /**
   * Determines whether the form action is relative to the route hierarchy or
   * the pathname.  Use this if you want to opt out of navigating the route
   * hierarchy and want to instead route based on /-delimited URL segments
   */
  relative?: RelativeRoutingType;

  /**
   * A function to call when the form is submitted. If you call
   * `event.preventDefault()` then this form will not do anything.
   */
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
}

/**
 * A `@remix-run/router`-aware `<form>`. It behaves like a normal form except
 * that the interaction with the server is with `fetch` instead of new document
 * requests, allowing components to add nicer UX to the page as the form is
 * submitted and returns with data.
 */
export const Form = React.forwardRef<HTMLFormElement, FormProps>(
  (props, ref) => {
    return <FormImpl {...props} ref={ref} />;
  }
);

if (__DEV__) {
  Form.displayName = "Form";
}

type HTMLSubmitEvent = React.BaseSyntheticEvent<
  SubmitEvent,
  Event,
  HTMLFormElement
>;

type HTMLFormSubmitter = HTMLButtonElement | HTMLInputElement;

interface FormImplProps extends FormProps {
  fetcherKey?: string;
  routeId?: string;
}

const FormImpl = React.forwardRef<HTMLFormElement, FormImplProps>(
  (
    {
      reloadDocument,
      replace,
      method = defaultMethod,
      action,
      onSubmit,
      fetcherKey,
      routeId,
      relative,
      ...props
    },
    forwardedRef
  ) => {
    let submit = useSubmitImpl(fetcherKey, routeId);
    let formMethod: FormMethod =
      method.toLowerCase() === "get" ? "get" : "post";
    let formAction = useFormAction(action, { relative });
    let submitHandler: React.FormEventHandler<HTMLFormElement> = (event) => {
      onSubmit && onSubmit(event);
      if (event.defaultPrevented) return;
      event.preventDefault();

      let submitter = (event as unknown as HTMLSubmitEvent).nativeEvent
        .submitter as HTMLFormSubmitter | null;

      submit(submitter || event.currentTarget, { method, replace, relative });
    };

    return (
      <form
        ref={forwardedRef}
        method={formMethod}
        action={formAction}
        onSubmit={reloadDocument ? onSubmit : submitHandler}
        {...props}
      />
    );
  }
);

if (__DEV__) {
  Form.displayName = "Form";
}

interface ScrollRestorationProps {
  getKey?: GetScrollRestorationKeyFunction;
  storageKey?: string;
}

/**
 * This component will emulate the browser's scroll restoration on location
 * changes.
 */
export function ScrollRestoration({
  getKey,
  storageKey,
}: ScrollRestorationProps) {
  useScrollRestoration({ getKey, storageKey });
  return null;
}

if (__DEV__) {
  ScrollRestoration.displayName = "ScrollRestoration";
}
//#endregion

////////////////////////////////////////////////////////////////////////////////
//#region Hooks
////////////////////////////////////////////////////////////////////////////////

enum DataRouterHook {
  UseScrollRestoration = "useScrollRestoration",
  UseSubmitImpl = "useSubmitImpl",
  UseFetcher = "useFetcher",
}

enum DataRouterStateHook {
  UseFetchers = "useFetchers",
  UseScrollRestoration = "useScrollRestoration",
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
 * Handles the click behavior for router `<Link>` components. This is useful if
 * you need to create custom `<Link>` components with the same click behavior we
 * use in our exported `<Link>`.
 */
export function useLinkClickHandler<E extends Element = HTMLAnchorElement>( // useLinkClickHandler hook
  to: To,
  {
    target,
    replace: replaceProp,
    state,
    preventScrollReset,
    relative,
  }: {
    target?: React.HTMLAttributeAnchorTarget;
    replace?: boolean;
    state?: any;
    preventScrollReset?: boolean;
    relative?: RelativeRoutingType;
  } = {}
): (event: React.MouseEvent<E, MouseEvent>) => void {
  let navigate = useNavigate(); // 执行useNavigate hook // +++
  let location = useLocation(); // 执行useLocation hook
  let path = useResolvedPath(to, { relative });

  // 返回一个函数 // +++
  return React.useCallback(
    (event: React.MouseEvent<E, MouseEvent>) => {
      if (shouldProcessLinkClick(event, target)) {
        event.preventDefault();

        // If the URL hasn't changed, a regular <a> will do a replace instead of
        // a push, so do the same here unless the replace prop is explicitly set
        let replace =
          replaceProp !== undefined
            ? replaceProp
            : createPath(location) === createPath(path);

        // 直接执行navigate函数 - 就是useNavigate hook中执行后返回的navigate函数
        navigate(to /** /contacts/蔡文静 */, { replace, state, preventScrollReset, relative });
      }
    },
    [
      location,
      navigate,
      path,
      replaceProp,
      state,
      target,
      to,
      preventScrollReset,
      relative,
    ]
  );
}

/**
 * A convenient wrapper for reading and writing search parameters via the
 * URLSearchParams interface.
 */
export function useSearchParams(
  defaultInit?: URLSearchParamsInit
): [URLSearchParams, SetURLSearchParams] {
  warning(
    typeof URLSearchParams !== "undefined",
    `You cannot use the \`useSearchParams\` hook in a browser that does not ` +
      `support the URLSearchParams API. If you need to support Internet ` +
      `Explorer 11, we recommend you load a polyfill such as ` +
      `https://github.com/ungap/url-search-params\n\n` +
      `If you're unsure how to load polyfills, we recommend you check out ` +
      `https://polyfill.io/v3/ which provides some recommendations about how ` +
      `to load polyfills only for users that need them, instead of for every ` +
      `user.`
  );

  let defaultSearchParamsRef = React.useRef(createSearchParams(defaultInit));

  let location = useLocation();
  let searchParams = React.useMemo(
    () =>
      getSearchParamsForLocation(
        location.search,
        defaultSearchParamsRef.current
      ),
    [location.search]
  );

  let navigate = useNavigate();
  let setSearchParams = React.useCallback<SetURLSearchParams>(
    (nextInit, navigateOptions) => {
      const newSearchParams = createSearchParams(
        typeof nextInit === "function" ? nextInit(searchParams) : nextInit
      );
      navigate("?" + newSearchParams, navigateOptions);
    },
    [navigate, searchParams]
  );

  return [searchParams, setSearchParams];
}

type SetURLSearchParams = (
  nextInit?:
    | URLSearchParamsInit
    | ((prev: URLSearchParams) => URLSearchParamsInit),
  navigateOpts?: NavigateOptions
) => void;

type SubmitTarget =
  | HTMLFormElement
  | HTMLButtonElement
  | HTMLInputElement
  | FormData
  | URLSearchParams
  | { [name: string]: string }
  | null;

/**
 * Submits a HTML `<form>` to the server without reloading the page.
 */
export interface SubmitFunction {
  (
    /**
     * Specifies the `<form>` to be submitted to the server, a specific
     * `<button>` or `<input type="submit">` to use to submit the form, or some
     * arbitrary data to submit.
     *
     * Note: When using a `<button>` its `name` and `value` will also be
     * included in the form data that is submitted.
     */
    target: SubmitTarget,

    /**
     * Options that override the `<form>`'s own attributes. Required when
     * submitting arbitrary data without a backing `<form>`.
     */
    options?: SubmitOptions
  ): void;
}

/**
 * Returns a function that may be used to programmatically submit a form (or
 * some arbitrary data) to the server.
 */
export function useSubmit(): SubmitFunction {
  return useSubmitImpl();
}

function useSubmitImpl(fetcherKey?: string, routeId?: string): SubmitFunction {
  let { router } = useDataRouterContext(DataRouterHook.UseSubmitImpl);
  let defaultAction = useFormAction();

  return React.useCallback(
    (target, options = {}) => {
      if (typeof document === "undefined") {
        throw new Error(
          "You are calling submit during the server render. " +
            "Try calling submit within a `useEffect` or callback instead."
        );
      }

      let { method, encType, formData, url } = getFormSubmissionInfo(
        target,
        defaultAction,
        options
      );

      let href = url.pathname + url.search;
      let opts = {
        replace: options.replace,
        formData,
        formMethod: method as FormMethod,
        formEncType: encType as FormEncType,
      };
      if (fetcherKey) {
        invariant(routeId != null, "No routeId available for useFetcher()");
        router.fetch(fetcherKey, routeId, href, opts);
      } else {
        router.navigate(href, opts);
      }
    },
    [defaultAction, router, fetcherKey, routeId]
  );
}

export function useFormAction(
  action?: string,
  { relative }: { relative?: RelativeRoutingType } = {}
): string {
  let { basename } = React.useContext(NavigationContext);
  let routeContext = React.useContext(RouteContext);
  invariant(routeContext, "useFormAction must be used inside a RouteContext");

  let [match] = routeContext.matches.slice(-1);
  let resolvedAction = action ?? ".";
  // Shallow clone path so we can modify it below, otherwise we modify the
  // object referenced by useMemo inside useResolvedPath
  let path = { ...useResolvedPath(resolvedAction, { relative }) };

  // Previously we set the default action to ".". The problem with this is that
  // `useResolvedPath(".")` excludes search params and the hash of the resolved
  // URL. This is the intended behavior of when "." is specifically provided as
  // the form action, but inconsistent w/ browsers when the action is omitted.
  // https://github.com/remix-run/remix/issues/927
  let location = useLocation();
  if (action == null) {
    // Safe to write to these directly here since if action was undefined, we
    // would have called useResolvedPath(".") which will never include a search
    // or hash
    path.search = location.search;
    path.hash = location.hash;

    // When grabbing search params from the URL, remove the automatically
    // inserted ?index param so we match the useResolvedPath search behavior
    // which would not include ?index
    if (match.route.index) {
      let params = new URLSearchParams(path.search);
      params.delete("index");
      path.search = params.toString() ? `?${params.toString()}` : "";
    }
  }

  if ((!action || action === ".") && match.route.index) {
    path.search = path.search
      ? path.search.replace(/^\?/, "?index&")
      : "?index";
  }

  // If we're operating within a basename, prepend it to the pathname prior
  // to creating the form action.  If this is a root navigation, then just use
  // the raw basename which allows the basename to have full control over the
  // presence of a trailing slash on root actions
  if (basename !== "/") {
    path.pathname =
      path.pathname === "/" ? basename : joinPaths([basename, path.pathname]);
  }

  return createPath(path);
}

function createFetcherForm(fetcherKey: string, routeId: string) {
  let FetcherForm = React.forwardRef<HTMLFormElement, FormProps>(
    (props, ref) => {
      return (
        <FormImpl
          {...props}
          ref={ref}
          fetcherKey={fetcherKey}
          routeId={routeId}
        />
      );
    }
  );
  if (__DEV__) {
    FetcherForm.displayName = "fetcher.Form";
  }
  return FetcherForm;
}

let fetcherId = 0;

export type FetcherWithComponents<TData> = Fetcher<TData> & {
  Form: ReturnType<typeof createFetcherForm>;
  submit: (
    target: SubmitTarget,
    // Fetchers cannot replace because they are not navigation events
    options?: Omit<SubmitOptions, "replace">
  ) => void;
  load: (href: string) => void;
};

/**
 * Interacts with route loaders and actions without causing a navigation. Great
 * for any interaction that stays on the same page.
 */
export function useFetcher<TData = any>(): FetcherWithComponents<TData> {
  let { router } = useDataRouterContext(DataRouterHook.UseFetcher);

  let route = React.useContext(RouteContext);
  invariant(route, `useFetcher must be used inside a RouteContext`);

  let routeId = route.matches[route.matches.length - 1]?.route.id;
  invariant(
    routeId != null,
    `useFetcher can only be used on routes that contain a unique "id"`
  );

  let [fetcherKey] = React.useState(() => String(++fetcherId));
  let [Form] = React.useState(() => {
    invariant(routeId, `No routeId available for fetcher.Form()`);
    return createFetcherForm(fetcherKey, routeId);
  });
  let [load] = React.useState(() => (href: string) => {
    invariant(router, "No router available for fetcher.load()");
    invariant(routeId, "No routeId available for fetcher.load()");
    router.fetch(fetcherKey, routeId, href);
  });
  let submit = useSubmitImpl(fetcherKey, routeId);

  let fetcher = router.getFetcher<TData>(fetcherKey);

  let fetcherWithComponents = React.useMemo(
    () => ({
      Form,
      submit,
      load,
      ...fetcher,
    }),
    [fetcher, Form, submit, load]
  );

  React.useEffect(() => {
    // Is this busted when the React team gets real weird and calls effects
    // twice on mount?  We really just need to garbage collect here when this
    // fetcher is no longer around.
    return () => {
      if (!router) {
        console.warn(`No fetcher available to clean up from useFetcher()`);
        return;
      }
      router.deleteFetcher(fetcherKey);
    };
  }, [router, fetcherKey]);

  return fetcherWithComponents;
}

/**
 * Provides all fetchers currently on the page. Useful for layouts and parent
 * routes that need to provide pending/optimistic UI regarding the fetch.
 */
export function useFetchers(): Fetcher[] {
  let state = useDataRouterState(DataRouterStateHook.UseFetchers);
  return [...state.fetchers.values()];
}

const SCROLL_RESTORATION_STORAGE_KEY = "react-router-scroll-positions";
let savedScrollPositions: Record<string, number> = {};

/**
 * When rendered inside a RouterProvider, will restore scroll positions on navigations
 */
function useScrollRestoration({
  getKey,
  storageKey,
}: {
  getKey?: GetScrollRestorationKeyFunction;
  storageKey?: string;
} = {}) {
  let { router } = useDataRouterContext(DataRouterHook.UseScrollRestoration);
  let { restoreScrollPosition, preventScrollReset } = useDataRouterState(
    DataRouterStateHook.UseScrollRestoration
  );
  let location = useLocation();
  let matches = useMatches();
  let navigation = useNavigation();

  // Trigger manual scroll restoration while we're active
  React.useEffect(() => {
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = "auto";
    };
  }, []);

  // Save positions on unload
  useBeforeUnload(
    React.useCallback(() => {
      if (navigation.state === "idle") {
        let key = (getKey ? getKey(location, matches) : null) || location.key;
        savedScrollPositions[key] = window.scrollY;
      }
      sessionStorage.setItem(
        storageKey || SCROLL_RESTORATION_STORAGE_KEY,
        JSON.stringify(savedScrollPositions)
      );
      window.history.scrollRestoration = "auto";
    }, [storageKey, getKey, navigation.state, location, matches])
  );

  // Read in any saved scroll locations
  React.useLayoutEffect(() => {
    try {
      let sessionPositions = sessionStorage.getItem(
        storageKey || SCROLL_RESTORATION_STORAGE_KEY
      );
      if (sessionPositions) {
        savedScrollPositions = JSON.parse(sessionPositions);
      }
    } catch (e) {
      // no-op, use default empty object
    }
  }, [storageKey]);

  // Enable scroll restoration in the router
  React.useLayoutEffect(() => {
    let disableScrollRestoration = router?.enableScrollRestoration(
      savedScrollPositions,
      () => window.scrollY,
      getKey
    );
    return () => disableScrollRestoration && disableScrollRestoration();
  }, [router, getKey]);

  // Restore scrolling when state.restoreScrollPosition changes
  React.useLayoutEffect(() => {
    // Explicit false means don't do anything (used for submissions)
    if (restoreScrollPosition === false) {
      return;
    }

    // been here before, scroll to it
    if (typeof restoreScrollPosition === "number") {
      window.scrollTo(0, restoreScrollPosition);
      return;
    }

    // try to scroll to the hash
    if (location.hash) {
      let el = document.getElementById(location.hash.slice(1));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }

    // Opt out of scroll reset if this link requested it
    if (preventScrollReset === true) {
      return;
    }

    // otherwise go to the top on new locations
    window.scrollTo(0, 0);
  }, [location, restoreScrollPosition, preventScrollReset]);
}

function useBeforeUnload(callback: () => any): void {
  React.useEffect(() => {
    window.addEventListener("beforeunload", callback);
    return () => {
      window.removeEventListener("beforeunload", callback);
    };
  }, [callback]);
}

//#endregion

////////////////////////////////////////////////////////////////////////////////
//#region Utils
////////////////////////////////////////////////////////////////////////////////

function warning(cond: boolean, message: string): void {
  if (!cond) {
    // eslint-disable-next-line no-console
    if (typeof console !== "undefined") console.warn(message);

    try {
      // Welcome to debugging React Router!
      //
      // This error is thrown as a convenience so you can more easily
      // find the source for a warning that appears in the console by
      // enabling "pause on exceptions" in your JavaScript debugger.
      throw new Error(message);
      // eslint-disable-next-line no-empty
    } catch (e) {}
  }
}
//#endregion

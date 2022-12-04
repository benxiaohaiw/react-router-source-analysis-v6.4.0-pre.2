import type { History, Location, To } from "./history";
import {
  Action as HistoryAction,
  createLocation,
  createPath,
  createURL,
  parsePath,
} from "./history";
import type {
  DataResult,
  AgnosticDataRouteMatch,
  AgnosticDataRouteObject,
  DeferredResult,
  ErrorResult,
  FormEncType,
  FormMethod,
  RedirectResult,
  RouteData,
  AgnosticRouteObject,
  Submission,
  SuccessResult,
  AgnosticRouteMatch,
} from "./utils";
import {
  DeferredData,
  ErrorResponse,
  ResultType,
  convertRoutesToDataRoutes,
  getPathContributingMatches,
  invariant,
  isRouteErrorResponse,
  joinPaths,
  matchRoutes,
  resolveTo,
} from "./utils";

////////////////////////////////////////////////////////////////////////////////
//#region Types and Constants
////////////////////////////////////////////////////////////////////////////////

/**
 * A Router instance manages all navigation and data loading/mutations
 */
export interface Router {
  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Return the basename for the router
   */
  get basename(): RouterInit["basename"];

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Return the current state of the router
   */
  get state(): RouterState;

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Return the routes for this router instance
   */
  get routes(): AgnosticDataRouteObject[];

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Initialize the router, including adding history listeners and kicking off
   * initial data fetches.  Returns a function to cleanup listeners and abort
   * any in-progress loads
   */
  initialize(): Router;

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Subscribe to router.state updates
   *
   * @param fn function to call with the new state
   */
  subscribe(fn: RouterSubscriber): () => void;

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Enable scroll restoration behavior in the router
   *
   * @param savedScrollPositions Object that will manage positions, in case
   *                             it's being restored from sessionStorage
   * @param getScrollPosition    Function to get the active Y scroll position
   * @param getKey               Function to get the key to use for restoration
   */
  enableScrollRestoration(
    savedScrollPositions: Record<string, number>,
    getScrollPosition: GetScrollPositionFunction,
    getKey?: GetScrollRestorationKeyFunction
  ): () => void;

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Navigate forward/backward in the history stack
   * @param to Delta to move in the history stack
   */
  navigate(to: number): void;

  /**
   * Navigate to the given path
   * @param to Path to navigate to
   * @param opts Navigation options (method, submission, etc.)
   */
  navigate(to: To, opts?: RouterNavigateOptions): void;

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Trigger a fetcher load/submission
   *
   * @param key     Fetcher key
   * @param routeId Route that owns the fetcher
   * @param href    href to fetch
   * @param opts    Fetcher options, (method, submission, etc.)
   */
  fetch(
    key: string,
    routeId: string,
    href: string,
    opts?: RouterNavigateOptions
  ): void;

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Trigger a revalidation of all current route loaders and fetcher loads
   */
  revalidate(): void;

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Utility function to create an href for the given location
   * @param location
   */
  createHref(location: Location | URL): string;

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Get/create a fetcher for the given key
   * @param key
   */
  getFetcher<TData = any>(key?: string): Fetcher<TData>;

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Delete the fetcher for a given key
   * @param key
   */
  deleteFetcher(key?: string): void;

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Cleanup listeners and abort any in-progress loads
   */
  dispose(): void;

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Internal fetch AbortControllers accessed by unit tests
   */
  _internalFetchControllers: Map<string, AbortController>;

  /**
   * @internal
   * PRIVATE - DO NOT USE
   *
   * Internal pending DeferredData instances accessed by unit tests
   */
  _internalActiveDeferreds: Map<string, DeferredData>;
}

/**
 * State maintained internally by the router.  During a navigation, all states
 * reflect the the "old" location unless otherwise noted.
 */
export interface RouterState {
  /**
   * The action of the most recent navigation
   */
  historyAction: HistoryAction;

  /**
   * The current location reflected by the router
   */
  location: Location;

  /**
   * The current set of route matches
   */
  matches: AgnosticDataRouteMatch[];

  /**
   * Tracks whether we've completed our initial data load
   */
  initialized: boolean;

  /**
   * Current scroll position we should start at for a new view
   *  - number -> scroll position to restore to
   *  - false -> do not restore scroll at all (used during submissions)
   *  - null -> don't have a saved position, scroll to hash or top of page
   */
  restoreScrollPosition: number | false | null;

  /**
   * Indicate whether this navigation should skip resetting the scroll position
   * if we are unable to restore the scroll position
   */
  preventScrollReset: boolean;

  /**
   * Tracks the state of the current navigation
   */
  navigation: Navigation;

  /**
   * Tracks any in-progress revalidations
   */
  revalidation: RevalidationState;

  /**
   * Data from the loaders for the current matches
   */
  loaderData: RouteData;

  /**
   * Data from the action for the current matches
   */
  actionData: RouteData | null;

  /**
   * Errors caught from loaders for the current matches
   */
  errors: RouteData | null;

  /**
   * Map of current fetchers
   */
  fetchers: Map<string, Fetcher>;
}

/**
 * Data that can be passed into hydrate a Router from SSR
 */
export type HydrationState = Partial<
  Pick<RouterState, "loaderData" | "actionData" | "errors">
>;

/**
 * Initialization options for createRouter
 */
export interface RouterInit {
  basename?: string;
  routes: AgnosticRouteObject[];
  history: History;
  hydrationData?: HydrationState;
}

/**
 * State returned from a server-side query() call
 */
export interface StaticHandlerContext {
  location: RouterState["location"];
  matches: RouterState["matches"];
  loaderData: RouterState["loaderData"];
  actionData: RouterState["actionData"];
  errors: RouterState["errors"];
  statusCode: number;
  loaderHeaders: Record<string, Headers>;
  actionHeaders: Record<string, Headers>;
  _deepestRenderedBoundaryId?: string | null;
}

/**
 * A StaticHandler instance manages a singular SSR navigation/fetch event
 */
export interface StaticHandler {
  dataRoutes: AgnosticDataRouteObject[];
  query(request: Request): Promise<StaticHandlerContext | Response>;
  queryRoute(request: Request, routeId?: string): Promise<any>;
}

/**
 * Subscriber function signature for changes to router state
 */
export interface RouterSubscriber {
  (state: RouterState): void;
}

interface UseMatchesMatch {
  id: string;
  pathname: string;
  params: AgnosticRouteMatch["params"];
  data: unknown;
  handle: unknown;
}

/**
 * Function signature for determining the key to be used in scroll restoration
 * for a given location
 */
export interface GetScrollRestorationKeyFunction {
  (location: Location, matches: UseMatchesMatch[]): string | null;
}

/**
 * Function signature for determining the current scroll position
 */
export interface GetScrollPositionFunction {
  (): number;
}

/**
 * Options for a navigate() call for a Link navigation
 */
type LinkNavigateOptions = {
  replace?: boolean;
  state?: any;
  preventScrollReset?: boolean;
};

/**
 * Options for a navigate() call for a Form navigation
 */
type SubmissionNavigateOptions = {
  replace?: boolean;
  state?: any;
  formMethod?: FormMethod;
  formEncType?: FormEncType;
  formData: FormData;
};

/**
 * Options to pass to navigate() for either a Link or Form navigation
 */
export type RouterNavigateOptions =
  | LinkNavigateOptions
  | SubmissionNavigateOptions;

/**
 * Options to pass to fetch()
 */
export type RouterFetchOptions =
  | Omit<LinkNavigateOptions, "replace">
  | Omit<SubmissionNavigateOptions, "replace">;

/**
 * Potential states for state.navigation
 */
export type NavigationStates = {
  Idle: {
    state: "idle";
    location: undefined;
    formMethod: undefined;
    formAction: undefined;
    formEncType: undefined;
    formData: undefined;
  };
  Loading: {
    state: "loading";
    location: Location;
    formMethod: FormMethod | undefined;
    formAction: string | undefined;
    formEncType: FormEncType | undefined;
    formData: FormData | undefined;
  };
  Submitting: {
    state: "submitting";
    location: Location;
    formMethod: FormMethod;
    formAction: string;
    formEncType: FormEncType;
    formData: FormData;
  };
};

export type Navigation = NavigationStates[keyof NavigationStates];

export type RevalidationState = "idle" | "loading";

/**
 * Potential states for fetchers
 */
type FetcherStates<TData = any> = {
  Idle: {
    state: "idle";
    formMethod: undefined;
    formAction: undefined;
    formEncType: undefined;
    formData: undefined;
    data: TData | undefined;
  };
  Loading: {
    state: "loading";
    formMethod: FormMethod | undefined;
    formAction: string | undefined;
    formEncType: FormEncType | undefined;
    formData: FormData | undefined;
    data: TData | undefined;
  };
  Submitting: {
    state: "submitting";
    formMethod: FormMethod;
    formAction: string;
    formEncType: FormEncType;
    formData: FormData;
    data: TData | undefined;
  };
};

export type Fetcher<TData = any> =
  FetcherStates<TData>[keyof FetcherStates<TData>];

interface ShortCircuitable {
  /**
   * startNavigation does not need to complete the navigation because we
   * redirected or got interrupted
   */
  shortCircuited?: boolean;
}

interface HandleActionResult extends ShortCircuitable {
  /**
   * Error thrown from the current action, keyed by the route containing the
   * error boundary to render the error.  To be committed to the state after
   * loaders have completed
   */
  pendingActionError?: RouteData;
  /**
   * Data returned from the current action, keyed by the route owning the action.
   * To be committed to the state after loaders have completed
   */
  pendingActionData?: RouteData;
}

interface HandleLoadersResult extends ShortCircuitable {
  /**
   * loaderData returned from the current set of loaders
   */
  loaderData?: RouterState["loaderData"];
  /**
   * errors thrown from the current set of loaders
   */
  errors?: RouterState["errors"];
}

/**
 * Tuple of [key, href, DataRouteMatch, DataRouteMatch[]] for a revalidating
 * fetcher.load()
 */
type RevalidatingFetcher = [
  string,
  string,
  AgnosticDataRouteMatch,
  AgnosticDataRouteMatch[]
];

/**
 * Tuple of [href, DataRouteMatch, DataRouteMatch[]] for an active
 * fetcher.load()
 */
type FetchLoadMatch = [
  string,
  AgnosticDataRouteMatch,
  AgnosticDataRouteMatch[]
];

/**
 * Wrapper object to allow us to throw any response out from callLoaderOrAction
 * for queryRouter while preserving whether or not it was thrown or returned
 * from the loader/action
 */
interface QueryRouteResponse {
  type: ResultType.data | ResultType.error;
  response: Response;
}

// 空闲导航 // +++
export const IDLE_NAVIGATION: NavigationStates["Idle"] = {
  state: "idle", // +++
  location: undefined,
  formMethod: undefined,
  formAction: undefined,
  formEncType: undefined,
  formData: undefined,
};

export const IDLE_FETCHER: FetcherStates["Idle"] = {
  state: "idle",
  data: undefined,
  formMethod: undefined,
  formAction: undefined,
  formEncType: undefined,
  formData: undefined,
};

const isBrowser =
  typeof window !== "undefined" &&
  typeof window.document !== "undefined" &&
  typeof window.document.createElement !== "undefined";
const isServer = !isBrowser;
//#endregion

////////////////////////////////////////////////////////////////////////////////
//#region createRouter
////////////////////////////////////////////////////////////////////////////////

/**
 * 创建路由器并监听history POP 导航（其实就是监听popstate事件） // +++
 * Create a router and listen to history POP navigations
 */
export function createRouter(init: RouterInit): Router {
  invariant(
    init.routes.length > 0,
    "You must provide a non-empty routes array to createRouter"
  );
  /* 
  benxiaohaiw/react-router-source-analysis-v6.4.0-pre.2/packages/react-router-dom/index.tsx下的createBrowserRouter -> enhanceManualRouteObjects处理的
  init.routes
  [
    {
      path: '/',
      element: <Root />,
      errorElement: <ErrorPage />,
      hasErrorBoundary: true,
      children: [
        {
          path: 'contacts/:contactId',
          element: <Contact />,
          hasErrorBoundary: false
        },
      ],
    },
  ]
  */

  // 转换路由为【数据路由】 // +++
  let dataRoutes = convertRoutesToDataRoutes(init.routes); // 也没有做什么 - 主要是进行
  /* 
  对每一个路由route进行浅拷贝 - 增加id属性 - 然后对路由的children再次进行递归性的convertRoutesToDataRoutes函数的执行

  id的规则是路由若有id属性则直接使用
  若没有则根据此route所在数组中的下标index（不是route的index属性啦）产生id
  比如
    0
      0-0
      0-1
    1
      1-0
  诸如此类
  */

  /* 
  dataRoutes
  [
    {
      path: '/',
      element: <Root />,
      errorElement: <ErrorPage />,
      hasErrorBoundary: true,
      id: '0',
      children: [
        {
          path: 'contacts/:contactId',
          element: <Contact />,
          hasErrorBoundary: false,
          id: '0-0'
        },
      ],
    },
  ]
  */

  /* 
  dataRoutes
  [
    {
      path: '/',
      element: <Root />,
      hasErrorBoundary: false,
      id: '0',
      children: [
        {
          path: 'a',
          element: <A />,
          hasErrorBoundary: false,
          id: '0-0',
          children: [
            {
              path: 'b/:xxx',
              element: <B />,
              hasErrorBoundary: false,
              id: '0-0-0',
            }
          ]
        },
        {
          path: 'c',
          element: <C />,
          hasErrorBoundary: false,
          id: '0-1',
        },
      ],
    },
    {
      path: '/d',
      element: <D />,
      hasErrorBoundary: false,
      id: '1',
    },
  ]
  */

  // 为history的清理函数
  // Cleanup function for history
  let unlistenHistory: (() => void) | null = null; // 取消监听history // +++
  // Externally-provided functions to call on all state changes
  let subscribers = new Set<RouterSubscriber>(); // 订阅者集合 - 一个Set // +++
  // Externally-provided object to hold scroll restoration locations during routing
  let savedScrollPositions: Record<string, number> | null = null; // 保存滚动位置
  // Externally-provided function to get scroll restoration keys
  let getScrollRestorationKey: GetScrollRestorationKeyFunction | null = null; // 获取滚动恢复key
  // Externally-provided function to get current scroll position
  let getScrollPosition: GetScrollPositionFunction | null = null; // 获取滚动位置
  // One-time flag to control the initial hydration scroll restoration.  Because
  // we don't get the saved positions from <ScrollRestoration /> until _after_
  // the initial render, we need to manually trigger a separate updateState to
  // send along the restoreScrollPosition
  let initialScrollRestored = false; // 初始滚动已恢复 - 默认为false // +++

  // 开始进行匹配路由
  // benxiaohaiw/react-router-source-analysis-v6.4.0-pre.2/packages/router/utils.ts下的matchRoutes函数 // +++
  let initialMatches = matchRoutes(
    dataRoutes,
    init.history.location, // 注意是【访问器属性】
    init.basename // undefiend - 那么该函数执行的时候basename的默认值就是'/'
  );
  // +++
  /* 
  /a/b/223
  matches
  {
    params: {
      xxx: 223
    },
    pathname: '/',
    pathnameBase: '/',
    route原对象
  }
  {
    params: {
      xxx: 223
    },
    pathname: '/a/',
    pathnameBase: '/a',
    route原对象
  }
  {
    params: {
      xxx: 223
    },
    pathname: '/a/b/223',
    pathnameBase: '/a/b/223',
    route原对象
  }
  */

  let initialErrors: RouteData | null = null;

  // 没有匹配到的
  if (initialMatches == null) {
    // 如果我们没有匹配用户提供的路由，退回到根节点，允许错误边界接管 // +++
    // If we do not match a user-provided-route, fall back to the root
    // to allow the error boundary to take over
    let { matches, route, error } = getNotFoundMatches(dataRoutes); // +++ 在数据路由中获取【找不到】匹配 // +++
    // 实际上就是创建一个对应的 - 具体细节看此函数 // +++

    initialMatches = matches; // 赋值匹配最初始匹配 // +++
    initialErrors = { [route.id]: error }; // 最初始错误 // +++
  }

  // ++++++
  // 最初始匹配中是否有loader属性然后取反 或者 init参数对象中的hydrationData属性 != null 得到是否已初始化 // +++
  // +++
  let initialized =
    !initialMatches.some((m) => m.route.loader) || init.hydrationData != null; // +++ // 初始匹配中一旦相应的route中loader属性存在一个，那么这里的初始化标记将变为false - 表示没有进行初始化 // +++
    // 那么这个标记将影响到当前的initialize函数中的逻辑（没有初始化那么需要做一个初始化也就是会在初始化阶段中额外执行一次startNavigation）以及RouterProvider组件中关于fallbackElement的显示的逻辑
  // +++

  // 准备【路由器对象】 // +++
  let router: Router;



  // 准备【路由器状态对象】 // +++
  let state: RouterState = {
    // packages/router/history.ts下的getUrlBasedHistory函数所返回的history对象的【访问器属性】
    historyAction: init.history.action, // 'POP'
    location: init.history.location, // 实际上是根据window.location创建一个location对象 - {pathname, search, hash, ...}
    matches: initialMatches, // 初始化匹配
    initialized, // ++++++ true or false // +++
    navigation: IDLE_NAVIGATION, // +++
    /* 
    // 空闲导航
    export const IDLE_NAVIGATION: NavigationStates["Idle"] = {
      state: "idle",
      location: undefined,
      formMethod: undefined,
      formAction: undefined,
      formEncType: undefined,
      formData: undefined,
    };
    */
    restoreScrollPosition: null,
    preventScrollReset: false,
    revalidation: "idle", // 重新生效 - 空闲
    // loader数据对象 // +++ 默认为空对象 // +++
    loaderData: (init.hydrationData && init.hydrationData.loaderData) || {}, /// 空对象 // +++
    actionData: (init.hydrationData && init.hydrationData.actionData) || null,
    errors: (init.hydrationData && init.hydrationData.errors) || initialErrors,
    fetchers: new Map(), // 请求者 - 一个map
  };

  // -- Stateful internal variables to manage navigations --
  // Current navigation in progress (to be committed in completeNavigation)
  let pendingAction: HistoryAction = HistoryAction.Pop; // 'POP'
  // Should the current navigation prevent the scroll reset if scroll cannot
  // be restored?
  let pendingPreventScrollReset = false;
  // AbortController for the active navigation
  let pendingNavigationController: AbortController | null;
  // We use this to avoid touching history in completeNavigation if a
  // revalidation is entirely uninterrupted
  let isUninterruptedRevalidation = false;
  // Use this internal flag to force revalidation of all loaders:
  //  - submissions (completed or interrupted)
  //  - useRevalidate()
  //  - X-Remix-Revalidate (from redirect)
  let isRevalidationRequired = false;
  // Use this internal array to capture routes that require revalidation due
  // to a cancelled deferred on action submission
  let cancelledDeferredRoutes: string[] = [];
  // Use this internal array to capture fetcher loads that were cancelled by an
  // action navigation and require revalidation
  let cancelledFetcherLoads: string[] = [];
  // AbortControllers for any in-flight fetchers
  let fetchControllers = new Map<string, AbortController>();
  // Track loads based on the order in which they started
  let incrementingLoadId = 0;
  // Track the outstanding pending navigation data load to be compared against
  // the globally incrementing load when a fetcher load lands after a completed
  // navigation
  let pendingNavigationLoadId = -1;
  // Fetchers that triggered data reloads as a result of their actions
  let fetchReloadIds = new Map<string, number>();
  // Fetchers that triggered redirect navigations from their actions
  let fetchRedirectIds = new Set<string>();
  // Most recent href/match for fetcher.load calls for fetchers
  let fetchLoadMatches = new Map<string, FetchLoadMatch>();
  // Store DeferredData instances for active route matches.  When a
  // route loader returns defer() we stick one in here.  Then, when a nested
  // promise resolves we update loaderData.  If a new navigation starts we
  // cancel active deferreds for eliminated routes.
  let activeDeferreds = new Map<string, DeferredData>();

  // 初始化路由器，所有的副作用都应该从这里开始。
  // Initialize the router, all side effects should be kicked off from here.
  // Implemented as a Fluent API for ease of:
  //   let router = createRouter(init).initialize();
  function initialize() { // 初始化函数 // +++
    // 如果history告诉我们有一个POP导航，启动导航但不更新状态。我们将在导航完成后更新自己的状态 // +++
    // If history informs us of a POP navigation, start the navigation but do not update
    // state.  We'll update our own state once the navigation completes
    unlistenHistory = init.history.listen( // 执行listen函数 // +++ packages/router/history.ts下的getUrlBasedHistory函数所返回的history对象的listen函数的执行 // +++
      ({ action: historyAction, location }) => // listener函数 // +++ 这个就是popstate事件的响应函数
      // 直接执行【开始导航】函数 // +++
        startNavigation(historyAction /** 'POP' */, location /** 当前最新的location对象 */) // 直接执行【开始导航】函数 // +++
    );
    /// 主要就是监听popstate事件

    // 如果需要，开始初始数据加载。使用 Pop 避免修改history
    // Kick off initial data load if needed.  Use Pop to avoid modifying history
    if (!state.initialized) { // 若没有进行初始化 // ++++++
      // 这里直接先进行【开始导航】 // +++ 额外的做一遍startNavigation // +++
      startNavigation(HistoryAction.Pop /** POP */, state.location); // 没有初始化需要先进行一次【开始导航】函数的执行 // ++++++
      // startNavigation是一个async函数 - 而这里并没有await它 - 所以并不会影响当前【初始化】函数下面逻辑的执行 - 下面直接返回router啦 ~ // ++++++
    }

    // 返回【路由器】对象 // +++
    return router;
  }

  // 清理路由器及其副作用
  // Clean up a router and it's side effects
  function dispose() {
    // 先执行取消监听history函数 // +++
    if (unlistenHistory) {
      unlistenHistory();
    }
    // 然后把订阅者进行clear
    subscribers.clear();
    // 待处理的导航控制器进行abort中止
    pendingNavigationController && pendingNavigationController.abort();
    // 请求者一一删除
    state.fetchers.forEach((_, key) => deleteFetcher(key));
  }

  // 订阅路由器的状态更新
  // Subscribe to state updates for the router
  function subscribe(fn: RouterSubscriber) {
    // 添加
    subscribers.add(fn); // +++

    // subscribers是一个Set

    // 返回一个删除函数
    return () => subscribers.delete(fn);
  }

  // 更新我们的状态并通知调用上下文更改 // +++
  // Update our state and notify the calling context of the change
  function updateState(newState: Partial<RouterState>): void {
    // 直接【新创建一个对象】赋值给state变量 - 以便于下面的router.state这个【访问器属性】可以动态的获取这里的state变量的值啦 ~
    state = { // 新创建一个对象
      ...state, // 浅拷贝
      ...newState, // 浅拷贝
      // 重写 // +++
    };

    // 一一执行订阅者函数 // +++ // 其实就是通知状态已变化啦 ~ // +++ ！！！

    // 这样在RouterProvider函数式组件中使用useSyncExternalStoreShim hook获取到的就是这里最新的state对象啦
    // 而这里的state对象是一个新创建的，所以最终就会采用这里新的对象

    // ++++++
    // 要知道在Routes组件中使用的useRoutes hook中会再一次的执行matchRoutes函数的（它所需要的routes来源于router.routes（【访问器属性】）所返回的数据路由dataRoutes），
    // 而这一次的matches将会作为需要渲染的结果元素的 // ++++++
    // ++++++
    // createRouter以及startNavigation中所做的matchRoutes函数执行都是为了对于没有匹配而提前进行getNotFoundMatches的处理
    // 而最终渲染的关键就在useRoutes hook中会再一次的执行matchRoutes函数所返回的匹配结果然后进行构建结构交给react渲染元素啦 ~

    // +++
    // 其实也就是在RouterProvider函数式组件中使用useSyncExternalStoreShim hook - 
    // 导致react把内部的handleStoreChange（包括forceUpdate）作为函数存入到当前的subscribers集合中，所以这里执行也就是handleStoreChange函数的执行啦 ~ 最终就会引起强制更新啦 ~） // +++
    subscribers.forEach((subscriber) => subscriber(state)); // +++
  }

  // Complete a navigation returning the state.navigation back to the IDLE_NAVIGATION
  // and setting state.[historyAction/location/matches] to the new route.
  // - Location is a required param
  // - Navigation will always be set to IDLE_NAVIGATION
  // - Can pass any other state in newState
  function completeNavigation( // 【完成导航】函数 // +++
    location: Location,
    newState: Partial<Omit<RouterState, "action" | "location" | "navigation">>
  ): void {
    // Deduce if we're in a loading/actionReload state:
    // - We have committed actionData in the store
    // - The current navigation was a submission
    // - We're past the submitting state and into the loading state
    // - The location we've finished loading is different from the submission
    //   location, indicating we redirected from the action (avoids false
    //   positives for loading/submissionRedirect when actionData returned
    //   on a prior submission)
    let isActionReload =
      state.actionData != null &&
      state.navigation.formMethod != null &&
      state.navigation.state === "loading" &&
      state.navigation.formAction?.split("?")[0] === location.pathname;

    // 始终保留来自重用路由的任何现有 loaderData // +++
    // Always preserve any existing loaderData from re-used routes
    let newLoaderData = newState.loaderData
      ? {
          loaderData: mergeLoaderData( // 合并loader数据对象
            state.loaderData,
            newState.loaderData, // 重写！！！ // +++
            newState.matches || []
          ),
        }
      : {};

    // 【更新状态】函数的执行 - 重点！！！ // +++ ！！！这里是引发页面更新的核心逻辑 - 通知状态变化了 ~ ！！！ - 页面就会进行更新啦 ~
    updateState({
      // Clear existing actionData on any completed navigation beyond the original
      // action, unless we're currently finishing the loading/actionReload state.
      // Do this prior to spreading in newState in case we got back to back actions
      ...(isActionReload ? {} : { actionData: null }),
      ...newState, // +++ new state对象浅拷贝在里面
      ...newLoaderData, // +++
      // +++
      // 浅拷贝 - 重写 // +++
      // +++
      // state.loaderData // +++

      historyAction: pendingAction, // +++
      location, // +++
      initialized: true, // +++ 已初始化标记为true啦 ~ // ！！！
      navigation: IDLE_NAVIGATION,
      revalidation: "idle",
      // Don't restore on submission navigations
      restoreScrollPosition: state.navigation.formData
        ? false
        : getSavedScrollPosition(location, newState.matches || state.matches),
      preventScrollReset: pendingPreventScrollReset,
    });

    if (isUninterruptedRevalidation) {
      // If this was an uninterrupted revalidation then do not touch history
    } else if (pendingAction === HistoryAction.Pop) {
      // 不对 POP 执行任何操作 - URL 已更新 // +++
      // Do nothing for POP - URL has already been updated
    } else if (pendingAction === HistoryAction.Push) {
      init.history.push(location, location.state); // 然后使用history的push函数 // +++ 其实就是更新地址栏中的url！！！
    } else if (pendingAction === HistoryAction.Replace) {
      init.history.replace(location, location.state); // 然后使用history的replace函数 // +++ 其实就是更新地址栏中的url！！！
    }

    // +++
    // 【重置】有状态导航变量 // +++
    // +++
    // Reset stateful navigation vars
    pendingAction = HistoryAction.Pop;
    pendingPreventScrollReset = false;
    isUninterruptedRevalidation = false;
    isRevalidationRequired = false;
    cancelledDeferredRoutes = [];
    cancelledFetcherLoads = [];
  }

  // 触发一个导航事件，它可以是一个数值POP或一个PUSH替换为可选提交
  // Trigger a navigation event, which can either be a numerical POP or a PUSH
  // replace with an optional submission
  async function navigate(
    to: number | To,
    opts?: RouterNavigateOptions
  ): Promise<void> {
    if (typeof to === "number") {
      init.history.go(to); // 是数字的话直接history的go函数执行就好了 - 原因在于popstate事件的监听啦 ~ 最终会执行此事件的响应函数（它在initialize函数中监听的） - 然后就执行了【开始导航】函数啦 ~
      return; // 直接返回return即可啦 ~
    }

    // 序列化导航参数
    let { path /** /contacts/蔡文静 */, submission, error } = normalizeNavigateOptions(to, opts); // 多了表单项的额外逻辑，它会把表单项转为search拼接到路径的后面形成/xxx?xxx=xxx这种格式的 // +++
    // 得到的这个path还是/contacts/蔡文静

    // 创建location对象 // +++
    let location = createLocation(state.location, path, opts && opts.state);
    // 直接返回一个{pathname: '/contacts/蔡文静', search, hash, ...}格式的对象 // +++

    // When using navigate as a PUSH/REPLACE we aren't reading an already-encoded
    // URL from window.location, so we need to encode it here so the behavior
    // remains the same as POP and non-data-router usages.  new URL() does all
    // the same encoding we'd get from a history.pushState/window.location read
    // without having to touch history
    location = init.history.encodeLocation(location); // 对location对象进行【编码】 // +++
    // 其实就是使用new URL()对最终产生的拼接路径进行处理得到解码后的选项然后重写这个location对象中的属性啦 ~ // +++

    let historyAction =
      (opts && opts.replace) === true || submission != null
        ? HistoryAction.Replace
        : HistoryAction.Push; // 'PUSH'
    let preventScrollReset =
      opts && "preventScrollReset" in opts
        ? opts.preventScrollReset === true
        : undefined;

    // 开始导航函数的执行 // +++
    return await startNavigation(historyAction /** PUSH */, location /** 上面的处理后的location对象 */, {
      submission,
      // Send through the formData serialization error if we have one so we can
      // render at the right error boundary after we match routes
      pendingError: error,
      preventScrollReset,
      replace: opts && opts.replace,
    });
  }

  // Revalidate all current loaders.  If a navigation is in progress or if this
  // is interrupted by a navigation, allow this to "succeed" by calling all
  // loaders during the next loader round
  function revalidate() {
    interruptActiveLoads();
    updateState({ revalidation: "loading" });

    // If we're currently submitting an action, we don't need to start a new
    // navigation, we'll just let the follow up loader execution call all loaders
    if (state.navigation.state === "submitting") {
      return;
    }

    // If we're currently in an idle state, start a new navigation for the current
    // action/location and mark it as uninterrupted, which will skip the history
    // update in completeNavigation
    if (state.navigation.state === "idle") {
      startNavigation(state.historyAction, state.location, {
        startUninterruptedRevalidation: true,
      });
      return;
    }

    // Otherwise, if we're currently in a loading state, just start a new
    // navigation to the navigation.location but do not trigger an uninterrupted
    // revalidation so that history correctly updates once the navigation completes
    startNavigation(
      pendingAction || state.historyAction,
      state.navigation.location,
      { overrideNavigation: state.navigation }
    );
  }

  // Start a navigation to the given action/location.  Can optionally provide a
  // overrideNavigation which will override the normalLoad in the case of a redirect
  // navigation
  async function startNavigation( // 【开始导航】函数
    historyAction: HistoryAction,
    location: Location,
    opts?: {
      submission?: Submission;
      overrideNavigation?: Navigation;
      pendingError?: ErrorResponse;
      startUninterruptedRevalidation?: boolean;
      preventScrollReset?: boolean;
      replace?: boolean;
    }
  ): Promise<void> {
    // Abort any in-progress navigations and start a new one. Unset any ongoing
    // uninterrupted revalidations unless told otherwise, since we want this
    // new navigation to update history normally
    pendingNavigationController && pendingNavigationController.abort(); // 待处理的导航控制器直接执行【中止】函数 // +++
    pendingNavigationController = null;
    pendingAction = historyAction;
    isUninterruptedRevalidation =
      (opts && opts.startUninterruptedRevalidation) === true;

    // Save the current scroll position every time we start a new navigation,
    // and track whether we should reset scroll on completion
    saveScrollPosition(state.location, state.matches);
    pendingPreventScrollReset = (opts && opts.preventScrollReset) === true;

    let loadingNavigation = opts && opts.overrideNavigation;

    // 又执行一次matchRoutes // +++ 重点！！！ // +++
    let matches = matchRoutes(dataRoutes /** 数据路由 */, location /** location对象 - 其实就是基于to产生的{pathname, search, hash, ...} */, init.basename); // 再一次执行【匹配路由】函数
    /* 
    {
      params: {
        contactId: '蔡文静'
      },
      pathname: '/',
      pathnameBase: '/',
      route原对象
    }
    {
      params: {
        contactId: '蔡文静'
      },
      pathname: '/contacts/蔡文静',
      pathnameBase: '/contacts/蔡文静',
      route原对象
    }
    */

    // 如果我们什么都不匹配，则在根错误边界上使用 404 进行短路 // +++
    // Short circuit with a 404 on the root error boundary if we match nothing
    if (!matches) {
      let {
        matches: notFoundMatches,
        route,
        error,
      } = getNotFoundMatches(dataRoutes); // 获取【找不到】匹配 // +++
      // Cancel all pending deferred on 404s since we don't keep any routes
      cancelActiveDeferreds();
      completeNavigation(location, { // 直接完成导航啦 ~ // ！！！
        matches: notFoundMatches,
        loaderData: {},
        errors: {
          [route.id]: error,
        },
      });
      return; // +++
    }

    // 如果只是哈希更改，则短路
    // Short circuit if it's only a hash change
    if (isHashChangeOnly(state.location, location)) { // 是否只有hash变化了
      completeNavigation(location, { matches }); // 完成导航 // ！！！
      return; // +++
    }

    // Create a controller/Request for this navigation
    pendingNavigationController = new AbortController();
    let request = createRequest(
      location,
      pendingNavigationController.signal,
      opts && opts.submission
    );
    let pendingActionData: RouteData | undefined;
    let pendingError: RouteData | undefined;

    if (opts && opts.pendingError) {
      // If we have a pendingError, it means the user attempted a GET submission
      // with binary FormData so assign here and skip to handleLoaders.  That
      // way we handle calling loaders above the boundary etc.  It's not really
      // different from an actionError in that sense.
      pendingError = {
        [findNearestBoundary(matches).route.id]: opts.pendingError,
      };
    } else if (opts && opts.submission) {
      // Call action if we received an action submission
      let actionOutput = await handleAction(
        request,
        location,
        opts.submission,
        matches,
        { replace: opts.replace }
      );

      if (actionOutput.shortCircuited) {
        return;
      }

      pendingActionData = actionOutput.pendingActionData;
      pendingError = actionOutput.pendingActionError;

      let navigation: NavigationStates["Loading"] = {
        state: "loading",
        location,
        ...opts.submission,
      };
      loadingNavigation = navigation;
    }

    /* 
    https://reactrouter.com/en/main/route/loader
    route.loader
      Each route can define a "loader" function to provide data to the route element before it renders.
      每个路由都可以定义一个“加载器”函数来在渲染之前向路由元素提供数据。
    */

    // 调用加载器 // +++
    // Call loaders
    let { shortCircuited /** 是否短路 */, loaderData /** loader数据对象 */, errors } = await handleLoaders( // 处理loaders // +++
      request,
      location, // 关于to的一个对象{pathname: '/contacts/蔡文静', ...}
      matches, // matches数组
      loadingNavigation,
      opts && opts.submission,
      opts && opts.replace,
      pendingActionData,
      pendingError // undefined
    );

    // +++
    // loader函数中进行执行redirect函数执行结果作为它的返回值那么经过handleLoaders中的处理在其内部是【开始重定向导航】，之后返回短路，那么这里也就直接return啦 ~
    // 具体的逻辑可以到packages/router/utils.ts下的redirect函数中查看 // +++

    // 这里若是短路了那么直接return // +++
    if (shortCircuited) {
      return; // ++++++
    }

    // loaderData对象就是一个以route.id为key然后以route.loader函数执行结果作为value组合的键值对存入一个空对象中 // +++
    /* 
    handleLoaders
      getMatchesToLoad - 主要是获取需要进行加载的匹配matches（加载过的不需要再次加载、没有加载的那么就需要加载就会留下等等） -> matchesToLoad
      callLoadersAndMaybeResolveData - 调用这些loader函数然后对返回的结果进行解析为相应的数据格式 -> loaderResults
      findRedirect - 在返回的一组数据中倒序查找是否有redirect，有则直接返回
      getLoaderRedirect - 主要就是返回一个关于redirect的location相关的navigation对象
      startRedirectNavigation -> startNavigation
      返回短路
      processLoaderData - 按照loader对应的route的id作为key然后loader的结果作为value存入一个空对象中把这个对象作为loaderData啦（主要是靠matchesToLoad和loaderResults之间相互对应关系）
        // 这个loaderResults就是来源于matchesToLoad的顺序的，所以这里按照相互对应的关系处理是没有问题的 // +++
      返回loaderData对象
    */

    // packages/react-router/lib/hooks.tsx下的useLoaderData hook
    /* 
    返回最近的祖先 Route 加载器的加载器数据 // +++ 其实就是找到最近的祖先RouteContext然后获取它的matches数组中最后一个match，它就表示当前结构对应的route对象然后取出它的id在我们的loaderData对象中取值就可以啦 ~
    /// 这个loaderData对象的整合就是在handleLoaders -> processLoaderData里面按照对应的route的id以及其loader执行后返回的值作为键值对存入对象中，之后这个loaderData对象在completeNavigation -> updateState中更新到state.loaderData中啦
    // 而又经过RouterProvider函数式组件中的DataRouterStateContext提供值对象state，然后这个hook使用这个上下文就能够访问到state，然后按照对应的id取出值就表示对应route中loader函数执行的结果啦 ~
    */
    

    // +++
    // 不短路的话那么直接下面的【完成导航】逻辑的执行
    // 对于这里处理好之后的loaderData对象在completeNavigation中是合并这个loaderData对象然后重写进state.loaderData中啦 ~
    // 整个逻辑是这样的 // +++
    // 那么这样在RouterProvider函数式组件中是使用DataRouterStateContext的Provider组件进行提供的值对象就是这个state
    // 对于之后后代组件中使用的useLoaderData hook（具体看这个hook的详细逻辑） // +++

    // Clean up now that the action/loaders have completed.  Don't clean up if
    // we short circuited because pendingNavigationController will have already
    // been assigned to a new controller for the next navigation
    pendingNavigationController = null;

    // 【完成导航】函数的执行
    completeNavigation(location /** {pathname: '/contacts/蔡文静', search, hash, ...} */, { // newState对象 // +++
      matches, // 匹配的结果 - 上面的matches数组 // +++
      loaderData, // loader数据对象 // ++++++
      errors,
    });
  }

  // Call the action matched by the leaf route for this navigation and handle
  // redirects/errors
  async function handleAction(
    request: Request,
    location: Location,
    submission: Submission,
    matches: AgnosticDataRouteMatch[],
    opts?: { replace?: boolean }
  ): Promise<HandleActionResult> {
    interruptActiveLoads();

    // Put us in a submitting state
    let navigation: NavigationStates["Submitting"] = {
      state: "submitting",
      location,
      ...submission,
    };
    updateState({ navigation });

    // Call our action and get the result
    let result: DataResult;
    let actionMatch = getTargetMatch(matches, location);

    if (!actionMatch.route.action) {
      result = getMethodNotAllowedResult(location);
    } else {
      result = await callLoaderOrAction(
        "action",
        request,
        actionMatch,
        matches,
        router.basename
      );

      if (request.signal.aborted) {
        return { shortCircuited: true };
      }
    }

    if (isRedirectResult(result)) {
      let redirectNavigation: NavigationStates["Loading"] = {
        state: "loading",
        location: createLocation(state.location, result.location),
        ...submission,
      };
      await startRedirectNavigation(
        result,
        redirectNavigation,
        opts && opts.replace
      );
      return { shortCircuited: true };
    }

    if (isErrorResult(result)) {
      // Store off the pending error - we use it to determine which loaders
      // to call and will commit it when we complete the navigation
      let boundaryMatch = findNearestBoundary(matches, actionMatch.route.id);

      // By default, all submissions are REPLACE navigations, but if the
      // action threw an error that'll be rendered in an errorElement, we fall
      // back to PUSH so that the user can use the back button to get back to
      // the pre-submission form location to try again
      if ((opts && opts.replace) !== true) {
        pendingAction = HistoryAction.Push;
      }

      return {
        pendingActionError: { [boundaryMatch.route.id]: result.error },
      };
    }

    if (isDeferredResult(result)) {
      throw new Error("defer() is not supported in actions");
    }

    return {
      pendingActionData: { [actionMatch.route.id]: result.data },
    };
  }

  // 为给定的匹配进行调用所有适用的loaders，处理重定向、错误等。 // +++
  // Call all applicable loaders for the given matches, handling redirects,
  // errors, etc.
  async function handleLoaders( // 处理loaders // +++
    request: Request,
    location: Location,
    matches: AgnosticDataRouteMatch[],
    overrideNavigation?: Navigation,
    submission?: Submission,
    replace?: boolean,
    pendingActionData?: RouteData,
    pendingError?: RouteData
  ): Promise<HandleLoadersResult> {
    // Figure out the right navigation we want to use for data loading
    let loadingNavigation = overrideNavigation;
    if (!loadingNavigation) {
      let navigation: NavigationStates["Loading"] = {
        state: "loading",
        location,
        formMethod: undefined,
        formAction: undefined,
        formEncType: undefined,
        formData: undefined,
      };
      loadingNavigation = navigation;
    }

    // revalidating: 重新验证
    // Fetchers: 请求者
    let [matchesToLoad, revalidatingFetchers] = getMatchesToLoad( // 获取要去【加载执行（需要执行的loader）】的matches
      state, // 路由器状态对象
      matches, // matches数组
      submission,
      location, // 关于to的一个对象{pathname: '/contacts/蔡文静', ...}
      isRevalidationRequired,
      cancelledDeferredRoutes,
      cancelledFetcherLoads,
      pendingActionData,
      pendingError, // undefined
      fetchLoadMatches // 一个map
    );
    // 这里的逻辑 - 具体查看该函数内部的细节 // +++
    /* 
    /// 这个边界id是来源于这个待处理的错误的 // +++

    // 这里的逻辑是找到这个待处理错误id对应的路由匹配然后提取直到它的其部分（但不包含本身）
    // 然后再进行过滤出
    // 1.
    //   是新的那么就直接留下
    //   若不是新的但是loader数据对象中还没有数据那么也需要留下
    //   而不是新的且有数据啦就不需要留下啦 ~
    // 2.
    //   【取消延迟路由】中出现的也需要加载执行
    // 3.
    //   符合【应该重新验证loader规则】的
    */

    // Cancel pending deferreds for no-longer-matched routes or routes we're
    // about to reload.  Note that if this is an action reload we would have
    // already cancelled all pending deferreds so this would be a no-op
    cancelActiveDeferreds(
      (routeId) =>
        !(matches && matches.some((m) => m.route.id === routeId)) ||
        (matchesToLoad && matchesToLoad.some((m) => m.route.id === routeId))
    );

    // 如果我们没有要运行的loaders，则短路 // +++ 要注意！！！
    // Short circuit if we have no loaders to run
    if (matchesToLoad.length === 0 && revalidatingFetchers.length === 0) {
      // 直接完成导航
      completeNavigation(location, {
        matches,
        loaderData: mergeLoaderData(state.loaderData, {}, matches),
        // Commit pending error if we're short circuiting
        errors: pendingError || null,
        actionData: pendingActionData || null,
      });
      return { shortCircuited: true }; // 短路 // +++
    }

    // If this is an uninterrupted revalidation, we remain in our current idle
    // state.  If not, we need to switch to our loading state and load data,
    // preserving any new action data or existing action data (in the case of
    // a revalidation interrupting an actionReload)
    if (!isUninterruptedRevalidation) {
      revalidatingFetchers.forEach(([key]) => {
        let fetcher = state.fetchers.get(key);
        let revalidatingFetcher: FetcherStates["Loading"] = {
          state: "loading",
          data: fetcher && fetcher.data,
          formMethod: undefined,
          formAction: undefined,
          formEncType: undefined,
          formData: undefined,
        };
        state.fetchers.set(key, revalidatingFetcher);
      });
      updateState({
        navigation: loadingNavigation,
        actionData: pendingActionData || state.actionData || null,
        ...(revalidatingFetchers.length > 0
          ? { fetchers: new Map(state.fetchers) }
          : {}),
      });
    }

    pendingNavigationLoadId = ++incrementingLoadId;
    revalidatingFetchers.forEach(([key]) =>
      fetchControllers.set(key, pendingNavigationController!)
    );

    // +++
    // 返回整体的、loader的、fetcher的
    let { results, loaderResults, fetcherResults } =
      await callLoadersAndMaybeResolveData( // 调用loaders且可能解析数据 // +++
        state.matches,
        matches,
        matchesToLoad,
        revalidatingFetchers,
        request
      );

    if (request.signal.aborted) {
      return { shortCircuited: true }; // 短路 // +++
    }

    // Clean up _after_ loaders have completed.  Don't clean up if we short
    // circuited because fetchControllers would have been aborted and
    // reassigned to new controllers for the next navigation
    revalidatingFetchers.forEach(([key]) => fetchControllers.delete(key));

    // ++++++
    // 如果任何loaders返回重定向响应，则启动新的 REPLACE 导航 // ++++++
    // If any loaders returned a redirect Response, start a new REPLACE navigation
    let redirect = findRedirect(results); // 在整个结果中查找重定向 // +++
    /* 
    // 从最低匹配项开始查找任何返回的重定向错误
// Find any returned redirect errors, starting from the lowest match
function findRedirect(results: DataResult[]): RedirectResult | undefined {
  // 【倒序】遍历查找 // 一定注意是倒序！！！ // +++
  for (let i = results.length - 1; i >= 0; i--) {
    let result = results[i];
    if (isRedirectResult(result)) { // 注意：一旦找到就return // +++
      return result;
    }
  }
}
    */

    // +++
    if (redirect) {
      // 获取loader重定向
      let redirectNavigation = getLoaderRedirect(state, redirect); // 就是返回state.navigation对象的 // +++
      // 开始重定向导航 // +++
      await startRedirectNavigation(redirect, redirectNavigation, replace); // 开始重定向导航 // +++
      return { shortCircuited: true }; // 短路 // +++
      // +++
      // 这里是重点 // +++
      // +++
    }

    // 处理和提交loaders的输出 // +++
    // Process and commit output from loaders
    let { loaderData, errors } = processLoaderData(
      state,
      matches,
      matchesToLoad, // +++
      // 它俩之间做相应的对应的 // +++
      loaderResults, // +++
      pendingError,
      revalidatingFetchers,
      fetcherResults,
      activeDeferreds
    );
    // +++
    // 这一步其实就是按照loader对应的route的id作为key然后loader的结果作为value存入一个空对象中把这个对象作为loaderData啦 ~ // +++

    // Wire up subscribers to update loaderData as promises settle
    activeDeferreds.forEach((deferredData, routeId) => {
      deferredData.subscribe((aborted) => {
        // Note: No need to updateState here since the TrackedPromise on
        // loaderData is stable across resolve/reject
        // Remove this instance if we were aborted or if promises have settled
        if (aborted || deferredData.done) {
          activeDeferreds.delete(routeId);
        }
      });
    });

    markFetchRedirectsDone();
    let didAbortFetchLoads = abortStaleFetchLoads(pendingNavigationLoadId);

    return {
      loaderData, // 返回这个loader数据对象 // +++
      errors,
      ...(didAbortFetchLoads || revalidatingFetchers.length > 0
        ? { fetchers: new Map(state.fetchers) }
        : {}),
    };
  }

  function getFetcher<TData = any>(key: string): Fetcher<TData> {
    return state.fetchers.get(key) || IDLE_FETCHER;
  }

  // Trigger a fetcher load/submit for the given fetcher key
  function fetch(
    key: string,
    routeId: string,
    href: string,
    opts?: RouterFetchOptions
  ) {
    if (isServer) {
      throw new Error(
        "router.fetch() was called during the server render, but it shouldn't be. " +
          "You are likely calling a useFetcher() method in the body of your component. " +
          "Try moving it to a useEffect or a callback."
      );
    }

    if (fetchControllers.has(key)) abortFetcher(key);

    let matches = matchRoutes(dataRoutes, href, init.basename);
    if (!matches) {
      setFetcherError(key, routeId, new ErrorResponse(404, "Not Found", null));
      return;
    }

    let { path, submission } = normalizeNavigateOptions(href, opts, true);
    let match = getTargetMatch(matches, path);

    if (submission) {
      handleFetcherAction(key, routeId, path, match, matches, submission);
      return;
    }

    // Store off the match so we can call it's shouldRevalidate on subsequent
    // revalidations
    fetchLoadMatches.set(key, [path, match, matches]);
    handleFetcherLoader(key, routeId, path, match, matches);
  }

  // Call the action for the matched fetcher.submit(), and then handle redirects,
  // errors, and revalidation
  async function handleFetcherAction(
    key: string,
    routeId: string,
    path: string,
    match: AgnosticDataRouteMatch,
    requestMatches: AgnosticDataRouteMatch[],
    submission: Submission
  ) {
    interruptActiveLoads();
    fetchLoadMatches.delete(key);

    if (!match.route.action) {
      let { error } = getMethodNotAllowedResult(path);
      setFetcherError(key, routeId, error);
      return;
    }

    // Put this fetcher into it's submitting state
    let existingFetcher = state.fetchers.get(key);
    let fetcher: FetcherStates["Submitting"] = {
      state: "submitting",
      ...submission,
      data: existingFetcher && existingFetcher.data,
    };
    state.fetchers.set(key, fetcher);
    updateState({ fetchers: new Map(state.fetchers) });

    // Call the action for the fetcher
    let abortController = new AbortController();
    let fetchRequest = createRequest(path, abortController.signal, submission);
    fetchControllers.set(key, abortController);

    let actionResult = await callLoaderOrAction(
      "action",
      fetchRequest,
      match,
      requestMatches,
      router.basename
    );

    if (fetchRequest.signal.aborted) {
      // We can delete this so long as we weren't aborted by ou our own fetcher
      // re-submit which would have put _new_ controller is in fetchControllers
      if (fetchControllers.get(key) === abortController) {
        fetchControllers.delete(key);
      }
      return;
    }

    if (isRedirectResult(actionResult)) {
      fetchControllers.delete(key);
      fetchRedirectIds.add(key);
      let loadingFetcher: FetcherStates["Loading"] = {
        state: "loading",
        ...submission,
        data: undefined,
      };
      state.fetchers.set(key, loadingFetcher);
      updateState({ fetchers: new Map(state.fetchers) });

      let redirectNavigation: NavigationStates["Loading"] = {
        state: "loading",
        location: createLocation(state.location, actionResult.location),
        ...submission,
      };
      await startRedirectNavigation(actionResult, redirectNavigation);
      return;
    }

    // Process any non-redirect errors thrown
    if (isErrorResult(actionResult)) {
      setFetcherError(key, routeId, actionResult.error);
      return;
    }

    if (isDeferredResult(actionResult)) {
      invariant(false, "defer() is not supported in actions");
    }

    // Start the data load for current matches, or the next location if we're
    // in the middle of a navigation
    let nextLocation = state.navigation.location || state.location;
    let revalidationRequest = createRequest(
      nextLocation,
      abortController.signal
    );
    let matches =
      state.navigation.state !== "idle"
        ? matchRoutes(dataRoutes, state.navigation.location, init.basename)
        : state.matches;

    invariant(matches, "Didn't find any matches after fetcher action");

    let loadId = ++incrementingLoadId;
    fetchReloadIds.set(key, loadId);

    let loadFetcher: FetcherStates["Loading"] = {
      state: "loading",
      data: actionResult.data,
      ...submission,
    };
    state.fetchers.set(key, loadFetcher);

    let [matchesToLoad, revalidatingFetchers] = getMatchesToLoad(
      state,
      matches,
      submission,
      nextLocation,
      isRevalidationRequired,
      cancelledDeferredRoutes,
      cancelledFetcherLoads,
      { [match.route.id]: actionResult.data },
      undefined, // No need to send through errors since we short circuit above
      fetchLoadMatches
    );

    // Put all revalidating fetchers into the loading state, except for the
    // current fetcher which we want to keep in it's current loading state which
    // contains it's action submission info + action data
    revalidatingFetchers
      .filter(([staleKey]) => staleKey !== key)
      .forEach(([staleKey]) => {
        let existingFetcher = state.fetchers.get(staleKey);
        let revalidatingFetcher: FetcherStates["Loading"] = {
          state: "loading",
          data: existingFetcher && existingFetcher.data,
          formMethod: undefined,
          formAction: undefined,
          formEncType: undefined,
          formData: undefined,
        };
        state.fetchers.set(staleKey, revalidatingFetcher);
        fetchControllers.set(staleKey, abortController);
      });

    updateState({ fetchers: new Map(state.fetchers) });

    let { results, loaderResults, fetcherResults } =
      await callLoadersAndMaybeResolveData(
        state.matches,
        matches,
        matchesToLoad,
        revalidatingFetchers,
        revalidationRequest
      );

    if (abortController.signal.aborted) {
      return;
    }

    fetchReloadIds.delete(key);
    fetchControllers.delete(key);
    revalidatingFetchers.forEach(([staleKey]) =>
      fetchControllers.delete(staleKey)
    );

    let redirect = findRedirect(results);
    if (redirect) {
      let redirectNavigation = getLoaderRedirect(state, redirect);
      await startRedirectNavigation(redirect, redirectNavigation);
      return;
    }

    // Process and commit output from loaders
    let { loaderData, errors } = processLoaderData(
      state,
      state.matches,
      matchesToLoad,
      loaderResults,
      undefined,
      revalidatingFetchers,
      fetcherResults,
      activeDeferreds
    );

    let doneFetcher: FetcherStates["Idle"] = {
      state: "idle",
      data: actionResult.data,
      formMethod: undefined,
      formAction: undefined,
      formEncType: undefined,
      formData: undefined,
    };
    state.fetchers.set(key, doneFetcher);

    let didAbortFetchLoads = abortStaleFetchLoads(loadId);

    // If we are currently in a navigation loading state and this fetcher is
    // more recent than the navigation, we want the newer data so abort the
    // navigation and complete it with the fetcher data
    if (
      state.navigation.state === "loading" &&
      loadId > pendingNavigationLoadId
    ) {
      invariant(pendingAction, "Expected pending action");
      pendingNavigationController && pendingNavigationController.abort();

      completeNavigation(state.navigation.location, {
        matches,
        loaderData,
        errors,
        fetchers: new Map(state.fetchers),
      });
    } else {
      // otherwise just update with the fetcher data, preserving any existing
      // loaderData for loaders that did not need to reload.  We have to
      // manually merge here since we aren't going through completeNavigation
      updateState({
        errors,
        loaderData: mergeLoaderData(state.loaderData, loaderData, matches),
        ...(didAbortFetchLoads ? { fetchers: new Map(state.fetchers) } : {}),
      });
      isRevalidationRequired = false;
    }
  }

  // Call the matched loader for fetcher.load(), handling redirects, errors, etc.
  async function handleFetcherLoader(
    key: string,
    routeId: string,
    path: string,
    match: AgnosticDataRouteMatch,
    matches: AgnosticDataRouteMatch[]
  ) {
    let existingFetcher = state.fetchers.get(key);
    // Put this fetcher into it's loading state
    let loadingFetcher: FetcherStates["Loading"] = {
      state: "loading",
      formMethod: undefined,
      formAction: undefined,
      formEncType: undefined,
      formData: undefined,
      data: existingFetcher && existingFetcher.data,
    };
    state.fetchers.set(key, loadingFetcher);
    updateState({ fetchers: new Map(state.fetchers) });

    // Call the loader for this fetcher route match
    let abortController = new AbortController();
    let fetchRequest = createRequest(path, abortController.signal);
    fetchControllers.set(key, abortController);
    let result: DataResult = await callLoaderOrAction(
      "loader",
      fetchRequest,
      match,
      matches,
      router.basename
    );

    // Deferred isn't supported or fetcher loads, await everything and treat it
    // as a normal load.  resolveDeferredData will return undefined if this
    // fetcher gets aborted, so we just leave result untouched and short circuit
    // below if that happens
    if (isDeferredResult(result)) {
      result =
        (await resolveDeferredData(result, fetchRequest.signal, true)) ||
        result;
    }

    // We can delete this so long as we weren't aborted by ou our own fetcher
    // re-load which would have put _new_ controller is in fetchControllers
    if (fetchControllers.get(key) === abortController) {
      fetchControllers.delete(key);
    }

    if (fetchRequest.signal.aborted) {
      return;
    }

    // If the loader threw a redirect Response, start a new REPLACE navigation
    if (isRedirectResult(result)) {
      let redirectNavigation = getLoaderRedirect(state, result);
      await startRedirectNavigation(result, redirectNavigation);
      return;
    }

    // Process any non-redirect errors thrown
    if (isErrorResult(result)) {
      let boundaryMatch = findNearestBoundary(state.matches, routeId);
      state.fetchers.delete(key);
      // TODO: In remix, this would reset to IDLE_NAVIGATION if it was a catch -
      // do we need to behave any differently with our non-redirect errors?
      // What if it was a non-redirect Response?
      updateState({
        fetchers: new Map(state.fetchers),
        errors: {
          [boundaryMatch.route.id]: result.error,
        },
      });
      return;
    }

    invariant(!isDeferredResult(result), "Unhandled fetcher deferred data");

    // Put the fetcher back into an idle state
    let doneFetcher: FetcherStates["Idle"] = {
      state: "idle",
      data: result.data,
      formMethod: undefined,
      formAction: undefined,
      formEncType: undefined,
      formData: undefined,
    };
    state.fetchers.set(key, doneFetcher);
    updateState({ fetchers: new Map(state.fetchers) });
  }

  /**
   * Utility function to handle redirects returned from an action or loader.
   * Normally, a redirect "replaces" the navigation that triggered it.  So, for
   * example:
   *
   *  - user is on /a
   *  - user clicks a link to /b
   *  - loader for /b redirects to /c
   *
   * In a non-JS app the browser would track the in-flight navigation to /b and
   * then replace it with /c when it encountered the redirect response.  In
   * the end it would only ever update the URL bar with /c.
   *
   * In client-side routing using pushState/replaceState, we aim to emulate
   * this behavior and we also do not update history until the end of the
   * navigation (including processed redirects).  This means that we never
   * actually touch history until we've processed redirects, so we just use
   * the history action from the original navigation (PUSH or REPLACE).
   */
  async function startRedirectNavigation( // 开始重定向导航 // +++
    redirect: RedirectResult,
    navigation: Navigation,
    replace?: boolean
  ) {
    if (redirect.revalidate) {
      isRevalidationRequired = true;
    }
    invariant(
      navigation.location,
      "Expected a location on the redirect navigation"
    );
    // There's no need to abort on redirects, since we don't detect the
    // redirect until the action/loaders have settled
    pendingNavigationController = null;

    let redirectHistoryAction =
      replace === true ? HistoryAction.Replace : HistoryAction.Push; // 决定行为

    // 【开始导航】函数的执行 // +++
    await startNavigation(redirectHistoryAction /** 行为 */, navigation.location /** loaction对象 */, {
      overrideNavigation: navigation,
    });
  }

  // 调用loaders且可能解析数据 // +++
  async function callLoadersAndMaybeResolveData(
    currentMatches: AgnosticDataRouteMatch[],
    matches: AgnosticDataRouteMatch[],
    matchesToLoad: AgnosticDataRouteMatch[],
    fetchersToLoad: RevalidatingFetcher[],
    request: Request
  ) {
    // 并行调用所有【导航加载器】和【重新验证fetcher加载器】，然后将结果切成单独的数组，以便我们可以相应地处理它们 // +++
    // Call all navigation loaders and revalidating fetcher loaders in parallel,
    // then slice off the results into separate arrays so we can handle them
    // accordingly
    let results = await Promise.all([ // await 这里
      // 映射
      ...matchesToLoad.map((match) =>
        // 调用loader或action
        callLoaderOrAction("loader", request, match, matches, router.basename)
      ),
      ...fetchersToLoad.map(([, href, match, fetchMatches]) =>
        callLoaderOrAction(
          "loader",
          createRequest(href, request.signal),
          match,
          fetchMatches,
          router.basename
        )
      ),
    ]);

    // 提取前部分结果
    let loaderResults = results.slice(0, matchesToLoad.length);

    // 提取的目的为了方便的相应的处理它们 // +++

    // 提取后部分结果
    let fetcherResults = results.slice(matchesToLoad.length);

    await Promise.all([
      resolveDeferredResults(
        currentMatches,
        matchesToLoad,
        loaderResults,
        request.signal,
        false,
        state.loaderData
      ),
      resolveDeferredResults(
        currentMatches,
        fetchersToLoad.map(([, , match]) => match),
        fetcherResults,
        request.signal,
        true
      ),
    ]);

    // 返回整体的、loader的、fetcher的
    return { results, loaderResults, fetcherResults };
  }

  function interruptActiveLoads() {
    // Every interruption triggers a revalidation
    isRevalidationRequired = true;

    // Cancel pending route-level deferreds and mark cancelled routes for
    // revalidation
    cancelledDeferredRoutes.push(...cancelActiveDeferreds());

    // Abort in-flight fetcher loads
    fetchLoadMatches.forEach((_, key) => {
      if (fetchControllers.has(key)) {
        cancelledFetcherLoads.push(key);
        abortFetcher(key);
      }
    });
  }

  function setFetcherError(key: string, routeId: string, error: any) {
    let boundaryMatch = findNearestBoundary(state.matches, routeId);
    deleteFetcher(key);
    updateState({
      errors: {
        [boundaryMatch.route.id]: error,
      },
      fetchers: new Map(state.fetchers),
    });
  }

  function deleteFetcher(key: string): void {
    if (fetchControllers.has(key)) abortFetcher(key);
    fetchLoadMatches.delete(key);
    fetchReloadIds.delete(key);
    fetchRedirectIds.delete(key);
    state.fetchers.delete(key);
  }

  function abortFetcher(key: string) {
    let controller = fetchControllers.get(key);
    invariant(controller, `Expected fetch controller: ${key}`);
    controller.abort();
    fetchControllers.delete(key);
  }

  function markFetchersDone(keys: string[]) {
    for (let key of keys) {
      let fetcher = getFetcher(key);
      let doneFetcher: FetcherStates["Idle"] = {
        state: "idle",
        data: fetcher.data,
        formMethod: undefined,
        formAction: undefined,
        formEncType: undefined,
        formData: undefined,
      };
      state.fetchers.set(key, doneFetcher);
    }
  }

  function markFetchRedirectsDone(): void {
    let doneKeys = [];
    for (let key of fetchRedirectIds) {
      let fetcher = state.fetchers.get(key);
      invariant(fetcher, `Expected fetcher: ${key}`);
      if (fetcher.state === "loading") {
        fetchRedirectIds.delete(key);
        doneKeys.push(key);
      }
    }
    markFetchersDone(doneKeys);
  }

  function abortStaleFetchLoads(landedId: number): boolean {
    let yeetedKeys = [];
    for (let [key, id] of fetchReloadIds) {
      if (id < landedId) {
        let fetcher = state.fetchers.get(key);
        invariant(fetcher, `Expected fetcher: ${key}`);
        if (fetcher.state === "loading") {
          abortFetcher(key);
          fetchReloadIds.delete(key);
          yeetedKeys.push(key);
        }
      }
    }
    markFetchersDone(yeetedKeys);
    return yeetedKeys.length > 0;
  }

  function cancelActiveDeferreds(
    predicate?: (routeId: string) => boolean
  ): string[] {
    let cancelledRouteIds: string[] = [];
    activeDeferreds.forEach((dfd, routeId) => {
      if (!predicate || predicate(routeId)) {
        // Cancel the deferred - but do not remove from activeDeferreds here -
        // we rely on the subscribers to do that so our tests can assert proper
        // cleanup via _internalActiveDeferreds
        dfd.cancel();
        cancelledRouteIds.push(routeId);
        activeDeferreds.delete(routeId);
      }
    });
    return cancelledRouteIds;
  }

  // Opt in to capturing and reporting scroll positions during navigations,
  // used by the <ScrollRestoration> component
  function enableScrollRestoration(
    positions: Record<string, number>,
    getPosition: GetScrollPositionFunction,
    getKey?: GetScrollRestorationKeyFunction
  ) {
    savedScrollPositions = positions;
    getScrollPosition = getPosition;
    getScrollRestorationKey = getKey || ((location) => location.key);

    // Perform initial hydration scroll restoration, since we miss the boat on
    // the initial updateState() because we've not yet rendered <ScrollRestoration/>
    // and therefore have no savedScrollPositions available
    if (!initialScrollRestored && state.navigation === IDLE_NAVIGATION) {
      initialScrollRestored = true;
      let y = getSavedScrollPosition(state.location, state.matches);
      if (y != null) {
        updateState({ restoreScrollPosition: y });
      }
    }

    return () => {
      savedScrollPositions = null;
      getScrollPosition = null;
      getScrollRestorationKey = null;
    };
  }

  function saveScrollPosition(
    location: Location,
    matches: AgnosticDataRouteMatch[]
  ): void {
    if (savedScrollPositions && getScrollRestorationKey && getScrollPosition) {
      let userMatches = matches.map((m) =>
        createUseMatchesMatch(m, state.loaderData)
      );
      let key = getScrollRestorationKey(location, userMatches) || location.key;
      savedScrollPositions[key] = getScrollPosition();
    }
  }

  function getSavedScrollPosition(
    location: Location,
    matches: AgnosticDataRouteMatch[]
  ): number | null {
    if (savedScrollPositions && getScrollRestorationKey && getScrollPosition) {
      let userMatches = matches.map((m) =>
        createUseMatchesMatch(m, state.loaderData)
      );
      let key = getScrollRestorationKey(location, userMatches) || location.key;
      let y = savedScrollPositions[key];
      if (typeof y === "number") {
        return y;
      }
    }
    return null;
  }

  // 准备【路由器】对象
  router = {
    // 准备【访问器】属性
    get basename() {
      return init.basename;
    },
    // 获取状态对象 - 【访问器】属性 // +++
    get state() {
      return state; // 返回当前作用域中state变量指向的值 // +++ 因为当前是【访问器】属性 所以每次获取都会获取当前作用域下的最新的state变量指向的值啦 ~
    },
    // 返回数据路由
    get routes() {
      return dataRoutes; // 返回数据路由 // ++++++
    },
    // 初始化函数 // +++
    initialize,
    // 订阅函数 // +++
    subscribe,
    enableScrollRestoration,
    // 导航函数 // +++
    navigate, // navigate这个函数
    fetch,
    revalidate,
    // Passthrough to history-aware createHref used by useHref so we get proper
    // hash-aware URLs in DOM paths
    createHref: (to: To) => init.history.createHref(to),
    getFetcher,
    deleteFetcher,
    dispose,
    _internalFetchControllers: fetchControllers,
    _internalActiveDeferreds: activeDeferreds,
  };

  // 返回这个【路由器】对象 // +++
  return router;
}
//#endregion

////////////////////////////////////////////////////////////////////////////////
//#region createStaticHandler
////////////////////////////////////////////////////////////////////////////////

const validActionMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const validRequestMethods = new Set(["GET", "HEAD", ...validActionMethods]);

export function unstable_createStaticHandler(
  routes: AgnosticRouteObject[]
): StaticHandler {
  invariant(
    routes.length > 0,
    "You must provide a non-empty routes array to unstable_createStaticHandler"
  );

  let dataRoutes = convertRoutesToDataRoutes(routes);

  /**
   * The query() method is intended for document requests, in which we want to
   * call an optional action and potentially multiple loaders for all nested
   * routes.  It returns a StaticHandlerContext object, which is very similar
   * to the router state (location, loaderData, actionData, errors, etc.) and
   * also adds SSR-specific information such as the statusCode and headers
   * from action/loaders Responses.
   *
   * It _should_ never throw and should report all errors through the
   * returned context.errors object, properly associating errors to their error
   * boundary.  Additionally, it tracks _deepestRenderedBoundaryId which can be
   * used to emulate React error boundaries during SSr by performing a second
   * pass only down to the boundaryId.
   *
   * The one exception where we do not return a StaticHandlerContext is when a
   * redirect response is returned or thrown from any action/loader.  We
   * propagate that out and return the raw Response so the HTTP server can
   * return it directly.
   */
  async function query(
    request: Request
  ): Promise<StaticHandlerContext | Response> {
    let url = new URL(request.url);
    let location = createLocation("", createPath(url), null, "default");
    let matches = matchRoutes(dataRoutes, location);

    if (!validRequestMethods.has(request.method)) {
      let {
        matches: methodNotAllowedMatches,
        route,
        error,
      } = getMethodNotAllowedMatches(dataRoutes);
      return {
        location,
        matches: methodNotAllowedMatches,
        loaderData: {},
        actionData: null,
        errors: {
          [route.id]: error,
        },
        statusCode: error.status,
        loaderHeaders: {},
        actionHeaders: {},
      };
    } else if (!matches) {
      let {
        matches: notFoundMatches,
        route,
        error,
      } = getNotFoundMatches(dataRoutes);
      return {
        location,
        matches: notFoundMatches,
        loaderData: {},
        actionData: null,
        errors: {
          [route.id]: error,
        },
        statusCode: error.status,
        loaderHeaders: {},
        actionHeaders: {},
      };
    }

    let result = await queryImpl(request, location, matches);
    if (result instanceof Response) {
      return result;
    }

    // When returning StaticHandlerContext, we patch back in the location here
    // since we need it for React Context.  But this helps keep our submit and
    // loadRouteData operating on a Request instead of a Location
    return { location, ...result };
  }

  /**
   * The queryRoute() method is intended for targeted route requests, either
   * for fetch ?_data requests or resource route requests.  In this case, we
   * are only ever calling a single action or loader, and we are returning the
   * returned value directly.  In most cases, this will be a Response returned
   * from the action/loader, but it may be a primitive or other value as well -
   * and in such cases the calling context should handle that accordingly.
   *
   * We do respect the throw/return differentiation, so if an action/loader
   * throws, then this method will throw the value.  This is important so we
   * can do proper boundary identification in Remix where a thrown Response
   * must go to the Catch Boundary but a returned Response is happy-path.
   *
   * One thing to note is that any Router-initiated thrown Response (such as a
   * 404 or 405) will have a custom X-Remix-Router-Error: "yes" header on it
   * in order to differentiate from responses thrown from user actions/loaders.
   */
  async function queryRoute(request: Request, routeId?: string): Promise<any> {
    let url = new URL(request.url);
    let location = createLocation("", createPath(url), null, "default");
    let matches = matchRoutes(dataRoutes, location);

    if (!validRequestMethods.has(request.method)) {
      throw createRouterErrorResponse(null, {
        status: 405,
        statusText: "Method Not Allowed",
      });
    } else if (!matches) {
      throw createRouterErrorResponse(null, {
        status: 404,
        statusText: "Not Found",
      });
    }

    let match = routeId
      ? matches.find((m) => m.route.id === routeId)
      : getTargetMatch(matches, location);

    if (!match) {
      throw createRouterErrorResponse(null, {
        status: 404,
        statusText: "Not Found",
      });
    }

    let result = await queryImpl(request, location, matches, match);
    if (result instanceof Response) {
      return result;
    }

    let error = result.errors ? Object.values(result.errors)[0] : undefined;
    if (error !== undefined) {
      // If we got back result.errors, that means the loader/action threw
      // _something_ that wasn't a Response, but it's not guaranteed/required
      // to be an `instanceof Error` either, so we have to use throw here to
      // preserve the "error" state outside of queryImpl.
      throw error;
    }

    // Pick off the right state value to return
    let routeData = [result.actionData, result.loaderData].find((v) => v);
    return Object.values(routeData || {})[0];
  }

  async function queryImpl(
    request: Request,
    location: Location,
    matches: AgnosticDataRouteMatch[],
    routeMatch?: AgnosticDataRouteMatch
  ): Promise<Omit<StaticHandlerContext, "location"> | Response> {
    invariant(
      request.signal,
      "query()/queryRoute() requests must contain an AbortController signal"
    );

    try {
      if (validActionMethods.has(request.method)) {
        let result = await submit(
          request,
          matches,
          routeMatch || getTargetMatch(matches, location),
          routeMatch != null
        );
        return result;
      }

      let result = await loadRouteData(request, matches, routeMatch);
      return result instanceof Response
        ? result
        : {
            ...result,
            actionData: null,
            actionHeaders: {},
          };
    } catch (e) {
      // If the user threw/returned a Response in callLoaderOrAction, we throw
      // it to bail out and then return or throw here based on whether the user
      // returned or threw
      if (isQueryRouteResponse(e)) {
        if (e.type === ResultType.error && !isRedirectResponse(e.response)) {
          throw e.response;
        }
        return e.response;
      }
      // Redirects are always returned since they don't propagate to catch
      // boundaries
      if (isRedirectResponse(e)) {
        return e;
      }
      throw e;
    }
  }

  async function submit(
    request: Request,
    matches: AgnosticDataRouteMatch[],
    actionMatch: AgnosticDataRouteMatch,
    isRouteRequest: boolean
  ): Promise<Omit<StaticHandlerContext, "location"> | Response> {
    let result: DataResult;
    if (!actionMatch.route.action) {
      if (isRouteRequest) {
        throw createRouterErrorResponse(null, {
          status: 405,
          statusText: "Method Not Allowed",
        });
      }
      result = getMethodNotAllowedResult(request.url);
    } else {
      result = await callLoaderOrAction(
        "action",
        request,
        actionMatch,
        matches,
        undefined, // Basename not currently supported in static handlers
        true,
        isRouteRequest
      );

      if (request.signal.aborted) {
        let method = isRouteRequest ? "queryRoute" : "query";
        throw new Error(`${method}() call aborted`);
      }
    }

    if (isRedirectResult(result)) {
      // Uhhhh - this should never happen, we should always throw these from
      // callLoaderOrAction, but the type narrowing here keeps TS happy and we
      // can get back on the "throw all redirect responses" train here should
      // this ever happen :/
      throw new Response(null, {
        status: result.status,
        headers: {
          Location: result.location,
        },
      });
    }

    if (isDeferredResult(result)) {
      throw new Error("defer() is not supported in actions");
    }

    if (isRouteRequest) {
      // Note: This should only be non-Response values if we get here, since
      // isRouteRequest should throw any Response received in callLoaderOrAction
      if (isErrorResult(result)) {
        let boundaryMatch = findNearestBoundary(matches, actionMatch.route.id);
        return {
          matches: [actionMatch],
          loaderData: {},
          actionData: null,
          errors: {
            [boundaryMatch.route.id]: result.error,
          },
          // Note: statusCode + headers are unused here since queryRoute will
          // return the raw Response or value
          statusCode: 500,
          loaderHeaders: {},
          actionHeaders: {},
        };
      }

      return {
        matches: [actionMatch],
        loaderData: {},
        actionData: { [actionMatch.route.id]: result.data },
        errors: null,
        // Note: statusCode + headers are unused here since queryRoute will
        // return the raw Response or value
        statusCode: 200,
        loaderHeaders: {},
        actionHeaders: {},
      };
    }

    if (isErrorResult(result)) {
      // Store off the pending error - we use it to determine which loaders
      // to call and will commit it when we complete the navigation
      let boundaryMatch = findNearestBoundary(matches, actionMatch.route.id);
      let context = await loadRouteData(request, matches, undefined, {
        [boundaryMatch.route.id]: result.error,
      });

      // action status codes take precedence over loader status codes
      return {
        ...context,
        statusCode: isRouteErrorResponse(result.error)
          ? result.error.status
          : 500,
        actionData: null,
        actionHeaders: {
          ...(result.headers ? { [actionMatch.route.id]: result.headers } : {}),
        },
      };
    }

    let context = await loadRouteData(request, matches);

    return {
      ...context,
      // action status codes take precedence over loader status codes
      ...(result.statusCode ? { statusCode: result.statusCode } : {}),
      actionData: {
        [actionMatch.route.id]: result.data,
      },
      actionHeaders: {
        ...(result.headers ? { [actionMatch.route.id]: result.headers } : {}),
      },
    };
  }

  async function loadRouteData(
    request: Request,
    matches: AgnosticDataRouteMatch[],
    routeMatch?: AgnosticDataRouteMatch,
    pendingActionError?: RouteData
  ): Promise<
    | Omit<StaticHandlerContext, "location" | "actionData" | "actionHeaders">
    | Response
  > {
    let isRouteRequest = routeMatch != null;
    let requestMatches = routeMatch
      ? [routeMatch]
      : getLoaderMatchesUntilBoundary(
          matches,
          Object.keys(pendingActionError || {})[0]
        );
    let matchesToLoad = requestMatches.filter((m) => m.route.loader);

    // Short circuit if we have no loaders to run
    if (matchesToLoad.length === 0) {
      return {
        matches,
        loaderData: {},
        errors: pendingActionError || null,
        statusCode: 200,
        loaderHeaders: {},
      };
    }

    let results = await Promise.all([
      ...matchesToLoad.map((match) =>
        callLoaderOrAction(
          "loader",
          request,
          match,
          matches,
          undefined, // Basename not currently supported in static handlers
          true,
          isRouteRequest
        )
      ),
    ]);

    if (request.signal.aborted) {
      let method = isRouteRequest ? "queryRoute" : "query";
      throw new Error(`${method}() call aborted`);
    }

    // Can't do anything with these without the Remix side of things, so just
    // cancel them for now
    results.forEach((result) => {
      if (isDeferredResult(result)) {
        result.deferredData.cancel();
      }
    });

    // Process and commit output from loaders
    let context = processRouteLoaderData(
      matches,
      matchesToLoad,
      results,
      pendingActionError
    );

    return {
      ...context,
      matches,
    };
  }

  function createRouterErrorResponse(
    body: BodyInit | null | undefined,
    init: ResponseInit
  ) {
    return new Response(body, {
      ...init,
      headers: {
        ...init.headers,
        "X-Remix-Router-Error": "yes",
      },
    });
  }

  return {
    dataRoutes,
    query,
    queryRoute,
  };
}

//#endregion

////////////////////////////////////////////////////////////////////////////////
//#region Helpers
////////////////////////////////////////////////////////////////////////////////

/**
 * Given an existing StaticHandlerContext and an error thrown at render time,
 * provide an updated StaticHandlerContext suitable for a second SSR render
 */
export function getStaticContextFromError(
  routes: AgnosticDataRouteObject[],
  context: StaticHandlerContext,
  error: any
) {
  let newContext: StaticHandlerContext = {
    ...context,
    statusCode: 500,
    errors: {
      [context._deepestRenderedBoundaryId || routes[0].id]: error,
    },
  };
  return newContext;
}

// Normalize navigation options by converting formMethod=GET formData objects to
// URLSearchParams so they behave identically to links with query params
function normalizeNavigateOptions( // 序列化导航参数
  to: To,
  opts?: RouterNavigateOptions,
  isFetcher = false
): {
  path: string;
  submission?: Submission;
  error?: ErrorResponse;
} {
  let path = typeof to === "string" ? to : createPath(to); // 产生字符串的

  // Return location verbatim on non-submission navigations
  if (!opts || (!("formMethod" in opts) && !("formData" in opts))) {
    return { path };
  }

  // Create a Submission on non-GET navigations
  if (opts.formMethod != null && opts.formMethod !== "get") {
    return {
      path,
      submission: {
        formMethod: opts.formMethod,
        formAction: stripHashFromPath(path),
        formEncType:
          (opts && opts.formEncType) || "application/x-www-form-urlencoded",
        formData: opts.formData,
      },
    };
  }

  // No formData to flatten for GET submission
  if (!opts.formData) {
    return { path };
  }

  // Flatten submission onto URLSearchParams for GET submissions
  let parsedPath = parsePath(path); // 又解析路径为一个对象
  try {
    let searchParams = convertFormDataToSearchParams(opts.formData); // 转换表单数据为搜索参数xxx=xxx&yyy=yyy
    // Since fetcher GET submissions only run a single loader (as opposed to
    // navigation GET submissions which run all loaders), we need to preserve
    // any incoming ?index params
    if (
      isFetcher &&
      parsedPath.search &&
      hasNakedIndexQuery(parsedPath.search)
    ) {
      searchParams.append("index", "");
    }
    parsedPath.search = `?${searchParams}`; // 添加search属性值 // +++
  } catch (e) {
    return {
      path,
      error: new ErrorResponse(
        400,
        "Bad Request",
        "Cannot submit binary form data using GET"
      ),
    };
  }

  // 返回这个对象
  return { path: createPath(parsedPath) /** 生成一个路径/xxx?xxx=xxx#xxx这种格式的 */ };
}

// 获取loader重定向 // +++
function getLoaderRedirect(
  state: RouterState,
  redirect: RedirectResult
): Navigation {
  let { formMethod, formAction, formEncType, formData } = state.navigation;
  let navigation: NavigationStates["Loading"] = {
    state: "loading",
    location: createLocation(state.location, redirect.location), // +++
    formMethod: formMethod || undefined,
    formAction: formAction || undefined,
    formEncType: formEncType || undefined,
    formData: formData || undefined,
  };
  return navigation;
}

// 过滤掉所有捕获错误下面的所有路由，因为它们不会渲染，所以我们不需要加载它们
// Filter out all routes below any caught error as they aren't going to
// render so we don't need to load them
function getLoaderMatchesUntilBoundary( // 获取直到边界（不含边界）的前部分匹配loader
  matches: AgnosticDataRouteMatch[],
  boundaryId?: string
) {
  let boundaryMatches = matches;
  if (boundaryId) { // +++
    let index = matches.findIndex((m) => m.route.id === boundaryId); // 查找和边界id相等的index
    if (index >= 0) {
      boundaryMatches = matches.slice(0, index); // 提取前部分（不含这个边界）
    }
  }
  return boundaryMatches; // +++
}

// 获取要去【加载执行（需要执行的loader）】的matches
function getMatchesToLoad(
  state: RouterState,
  matches: AgnosticDataRouteMatch[],
  submission: Submission | undefined,
  location: Location,
  isRevalidationRequired: boolean,
  cancelledDeferredRoutes: string[],
  cancelledFetcherLoads: string[],
  pendingActionData?: RouteData,
  pendingError?: RouteData,
  fetchLoadMatches?: Map<string, FetchLoadMatch>
): [AgnosticDataRouteMatch[], RevalidatingFetcher[]] {
  let actionResult = pendingError
    ? Object.values(pendingError)[0]
    : pendingActionData
    ? Object.values(pendingActionData)[0]
    : null;

  // 选择全新的或有资格重新验证的导航匹配
  // Pick navigation matches that are net-new or qualify for revalidation
  let boundaryId = pendingError ? Object.keys(pendingError)[0] : undefined; // undefined // +++

  /// 这个边界id是来源于这个待处理的错误的 // +++

  // 下面逻辑是找到这个待处理错误id对应的路由匹配然后提取直到它的其部分（但不包含本身）
  // 然后再进行过滤出
  // 1.
  //   是新的那么就直接留下
  //   若不是新的但是loader数据对象中还没有数据那么也需要留下
  //   而不是新的且有数据啦就不需要留下啦 ~
  // 2.
  //   【取消延迟路由】中出现的也需要加载执行
  // 3.
  //   符合【应该重新验证loader规则】的

  // 若边界id是undefined那么直接返回的还是matches数组
  // 不是则在matches数组中查找这个route.id所在的index然后在matches数组中提取前部分（不包含这个id对应的match对象）
  let boundaryMatches = getLoaderMatchesUntilBoundary(matches, boundaryId); // 获取直到边界（不含边界）的前部分匹配loader // +++

  // 进行过滤 // +++
  let navigationMatches = boundaryMatches.filter(
    (match, index) =>
      match.route.loader != null && // 有loader的 且
      (isNewLoader(state.loaderData /** 空对象 */, state.matches[index] /** current中的 */, match /** 这里新的中间的 */) ||
      /* 
        // 是新的那么就直接留下
        // 若不是新的但是loader数据对象中还没有数据那么也需要留下
        // 而不是新的且有数据啦就不需要留下啦 ~
      */

        // 如果此路线有待处理的延期取消，则必须重新验证 // +++
        // If this route had a pending deferred cancelled it must be revalidated
        cancelledDeferredRoutes.some((id) => id === match.route.id) || // 取消延迟路由中出现的
        // 应该重新验证loader
        shouldRevalidateLoader(
          state.location,
          state.matches[index],
          submission,
          location, // 关于to的一个对象{pathname: '/contacts/蔡文静', ...} // ++++++ 重点 // ++++++ 这是强调注意的重点 // +++
          match,
          isRevalidationRequired,
          actionResult
        ))
  ); // 这里主要是进行筛选出需要的loader，因为在后面的逻辑里是需要去执行这个loader函数的
  // 而这里就是在筛选需要去执行的loader的，对于那些不需要进行执行的loader的这里都会去除掉 // +++
  // +++

  // 选择需要重新验证的 fetcher.loads
  // Pick fetcher.loads that need to be revalidated
  let revalidatingFetchers: RevalidatingFetcher[] = [];
  fetchLoadMatches && // 一个map
    fetchLoadMatches.forEach(([href, match, fetchMatches], key) => {
      // This fetcher was cancelled from a prior action submission - force reload
      if (cancelledFetcherLoads.includes(key)) {
        revalidatingFetchers.push([key, href, match, fetchMatches]);
      } else if (isRevalidationRequired) {
        let shouldRevalidate = shouldRevalidateLoader(
          href,
          match,
          submission,
          href,
          match,
          isRevalidationRequired,
          actionResult
        );
        if (shouldRevalidate) {
          revalidatingFetchers.push([key, href, match, fetchMatches]);
        }
      }
    });

  return [navigationMatches, revalidatingFetchers];
}

// 是新的loader
function isNewLoader(
  currentLoaderData: RouteData,
  currentMatch: AgnosticDataRouteMatch,
  match: AgnosticDataRouteMatch
) {
  // currentMatch 与 现在的match决定是否为新的loader
  let isNew =
    // [a] -> [a, b]
    !currentMatch || // current中没有匹配
    // [a, b] -> [a, c]
    match.route.id !== currentMatch.route.id; // 它俩之间id不相等 // +++
  // 是新的那么就直接留下
  // 若不是新的但是loader数据对象中还没有数据那么也需要留下
  // 而不是新的且有数据啦就不需要留下啦 ~

  // 处理没有重用路由的数据的情况，可能是由于先前的错误或由于取消的挂起的延迟
  // Handle the case that we don't have data for a re-used route, potentially
  // from a prior error or from a cancelled pending deferred
  let isMissingData = currentLoaderData[match.route.id] === undefined; // 是否为undefined // +++

  // 如果这是一条全新的路线或我们还没有数据，请始终加载
  // Always load if this is a net-new route or we don't yet have data
  return isNew || isMissingData; // +++
}

// 是否为新的路由实例
function isNewRouteInstance(
  currentMatch: AgnosticDataRouteMatch,
  match: AgnosticDataRouteMatch
) {
  let currentPath = currentMatch.route.path; // current path
  return (
    // // 此匹配项的参数更改，/users/123 -> /users/456
    // param change for this match, /users/123 -> /users/456
    currentMatch.pathname !== match.pathname ||
    // splat 参数已更改，match.path 中不存在
    // splat param changed, which is not present in match.path
    // e.g. /files/images/avatar.jpg -> files/finances.xls
    (currentPath &&
      currentPath.endsWith("*") && // 是以*结尾的
      currentMatch.params["*"] !== match.params["*"]) // 动态参数中两者结果不等 // +++
  );
}

// 应该重新验证loader
function shouldRevalidateLoader(
  currentLocation: string | Location,
  currentMatch: AgnosticDataRouteMatch,
  submission: Submission | undefined,
  location: string | Location,
  match: AgnosticDataRouteMatch,
  isRevalidationRequired: boolean,
  actionResult: DataResult | undefined
) {
  // 当前的 current
  let currentUrl = createURL(currentLocation);
  let currentParams = currentMatch.params;

  // 要去的 to
  let nextUrl = createURL(location);
  let nextParams = match.params;

  // This is the default implementation as to when we revalidate.  If the route
  // provides it's own implementation, then we give them full control but
  // provide this value so they can leverage it if needed after they check
  // their own specific use cases
  // Note that fetchers always provide the same current/next locations so the
  // URL-based checks here don't apply to fetcher shouldRevalidate calls
  let defaultShouldRevalidate = // 默认是否应该重新验证 // +++
    isNewRouteInstance(currentMatch, match) || // 是否为新的路由实例（路径名前后不一致的）
    // 单击相同的链接，重新提交 GET 表单
    // Clicked the same link, resubmitted a GET form
    currentUrl.toString() === nextUrl.toString() || // 是否相等
    // 搜索参数影响所有加载器
    // Search params affect all loaders
    currentUrl.search !== nextUrl.search || // 是否不相等
    // Forced revalidation due to submission, useRevalidate, or X-Remix-Revalidate
    isRevalidationRequired; // 由于submission、useRevalidate 或 X-Remix-Revalidate 而强制重新生效

  // 是否有shouldRevalidate cb // 这里调用
  if (match.route.shouldRevalidate) {
    let routeChoice = match.route.shouldRevalidate({
      currentUrl,
      currentParams,
      nextUrl,
      nextParams,
      ...submission,
      actionResult,
      defaultShouldRevalidate,
    });
    // 要求返回值为布尔值
    if (typeof routeChoice === "boolean") {
      return routeChoice; // 返回这个布尔值
    }
  }

  // 返回默认的决策 // +++
  return defaultShouldRevalidate;
}

// 调用loader或action
async function callLoaderOrAction(
  type: "loader" | "action",
  request: Request,
  match: AgnosticDataRouteMatch,
  matches: AgnosticDataRouteMatch[],
  basename: string | undefined,
  isStaticRequest: boolean = false,
  isRouteRequest: boolean = false
): Promise<DataResult> {
  let resultType;
  let result;

  // 设定一个我们可以与之竞争的pro,ise，以便中止信号短路 // +++
  // Setup a promise we can race against so that abort signals short circuit
  let reject: () => void;
  let abortPromise = new Promise((_, r) => (reject = r));
  let onReject = () => reject();
  request.signal.addEventListener("abort", onReject);

  try {
    // 取出对应的函数
    let handler = match.route[type]; // type: loader or action
    invariant<Function>(
      handler,
      `Could not find the ${type} to run on the "${match.route.id}" route`
    );

    // await
    result = await Promise.race([
      handler({ request, params: match.params }), // 执行这个handler函数 // +++
      abortPromise,
    ]);
  } catch (e) {
    resultType = ResultType.error;
    result = e;
  } finally {
    request.signal.removeEventListener("abort", onReject);
  }

  // +++
  // redirect函数的执行结果就是Response的实例对象 // +++
  // 结果是属于Response的实例对象 // +++
  if (result instanceof Response) {
    let status = result.status;

    // 处理重定向 // +++
    // Process redirects
    if (status >= 300 && status <= 399) {
      let location = result.headers.get("Location");
      invariant(
        location,
        "Redirects returned/thrown from loaders/actions must have a Location header"
      );

      // +++
      // 在重定向中支持相对路由 // +++
      // Support relative routing in redirects
      let activeMatches = matches.slice(0, matches.indexOf(match) + 1);
      let routePathnames = getPathContributingMatches(activeMatches).map(
        (match) => match.pathnameBase
      );
      let requestPath = createURL(request.url).pathname;
      let resolvedLocation = resolveTo(location, routePathnames, requestPath);
      invariant(
        createPath(resolvedLocation),
        `Unable to resolve redirect location: ${result.headers.get("Location")}`
      );

      // Prepend the basename to the redirect location if we have one
      if (basename) {
        let path = resolvedLocation.pathname;
        resolvedLocation.pathname =
          path === "/" ? basename : joinPaths([basename, path]);
      }

      location = createPath(resolvedLocation);

      // Don't process redirects in the router during static requests requests.
      // Instead, throw the Response and let the server handle it with an HTTP
      // redirect.  We also update the Location header in place in this flow so
      // basename and relative routing is taken into account
      if (isStaticRequest) {
        result.headers.set("Location", location);
        throw result;
      }

      return {
        type: ResultType.redirect, // +++
        status, // +++ 状态码
        location, // +++
        revalidate: result.headers.get("X-Remix-Revalidate") !== null,
      };
    }

    // For SSR single-route requests, we want to hand Responses back directly
    // without unwrapping.  We do this with the QueryRouteResponse wrapper
    // interface so we can know whether it was returned or thrown
    if (isRouteRequest) {
      // eslint-disable-next-line no-throw-literal
      throw {
        type: resultType || ResultType.data,
        response: result,
      };
    }

    let data: any;
    let contentType = result.headers.get("Content-Type");
    if (contentType && contentType.startsWith("application/json")) {
      data = await result.json(); // +++
    } else {
      data = await result.text(); // +++
    }

    if (resultType === ResultType.error) {
      return {
        type: resultType,
        error: new ErrorResponse(status, result.statusText, data),
        headers: result.headers,
      };
    }

    return {
      type: ResultType.data, // +++
      data, // +++
      statusCode: result.status, // +++
      headers: result.headers, // +++
    };
  }

  if (resultType === ResultType.error) {
    return { type: resultType, error: result };
  }

  // 结果是否属于DeferredData的实例对象
  if (result instanceof DeferredData) {
    return { type: ResultType.deferred, deferredData: result };
  }

  // 组合一个对象返回
  return { type: ResultType.data, data: result /** 作为数据data属性 */ }; // +++
}

function createRequest(
  location: string | Location,
  signal: AbortSignal,
  submission?: Submission
): Request {
  let url = createURL(stripHashFromPath(location)).toString();
  let init: RequestInit = { signal };

  if (submission) {
    let { formMethod, formEncType, formData } = submission;
    init.method = formMethod.toUpperCase();
    init.body =
      formEncType === "application/x-www-form-urlencoded"
        ? convertFormDataToSearchParams(formData)
        : formData;
  }

  // Content-Type is inferred (https://fetch.spec.whatwg.org/#dom-request)
  return new Request(url, init);
}

function convertFormDataToSearchParams(formData: FormData): URLSearchParams {
  let searchParams = new URLSearchParams();

  for (let [key, value] of formData.entries()) {
    invariant(
      typeof value === "string",
      'File inputs are not supported with encType "application/x-www-form-urlencoded", ' +
        'please use "multipart/form-data" instead.'
    );
    searchParams.append(key, value);
  }

  return searchParams;
}

// 处理路由loader数据
function processRouteLoaderData(
  matches: AgnosticDataRouteMatch[],
  matchesToLoad: AgnosticDataRouteMatch[],
  results: DataResult[],
  pendingError: RouteData | undefined,
  activeDeferreds?: Map<string, DeferredData>
): {
  loaderData: RouterState["loaderData"];
  errors: RouterState["errors"] | null;
  statusCode: number;
  loaderHeaders: Record<string, Headers>;
} {
  // 从我们的加载器中填充 loaderData/errors
  // Fill in loaderData/errors from our loaders
  let loaderData: RouterState["loaderData"] = {}; // 准备的loader数据对象 - 默认为空对象 // +++
  let errors: RouterState["errors"] | null = null;
  let statusCode: number | undefined;
  let foundError = false;
  let loaderHeaders: Record<string, Headers> = {};

  // 处理加载器结果到 state.loaderData/state.errors
  // Process loader results into state.loaderData/state.errors
  results /** // loaderResults // +++ */.forEach((result, index) => {
    let id = matchesToLoad[index].route.id; // 直接按照筛选出来的匹配结果取出对应route的id属性 // +++
    invariant(
      !isRedirectResult(result),
      "Cannot handle redirect results in processLoaderData"
    );
    if (isErrorResult(result)) {
      // Look upwards from the matched route for the closest ancestor
      // error boundary, defaulting to the root match
      let boundaryMatch = findNearestBoundary(matches, id);
      let error = result.error;
      // If we have a pending action error, we report it at the highest-route
      // that throws a loader error, and then clear it out to indicate that
      // it was consumed
      if (pendingError) {
        error = Object.values(pendingError)[0];
        pendingError = undefined;
      }
      errors = Object.assign(errors || {}, {
        [boundaryMatch.route.id]: error,
      });
      // Once we find our first (highest) error, we set the status code and
      // prevent deeper status codes from overriding
      if (!foundError) {
        foundError = true;
        statusCode = isRouteErrorResponse(result.error)
          ? result.error.status
          : 500;
      }
      if (result.headers) {
        loaderHeaders[id] = result.headers;
      }
    } else if (isDeferredResult(result)) {
      activeDeferreds && activeDeferreds.set(id, result.deferredData);
      loaderData[id] = result.deferredData.data;
      // TODO: Add statusCode/headers once we wire up streaming in Remix
    } else {
      loaderData[id] = result.data; // 直接把id作为key然后每一个result对象的data属性作为value存入进行loader数据对象中来 ~ // +++
      // Error status codes always override success status codes, but if all
      // loaders are successful we take the deepest status code.
      if (
        result.statusCode != null &&
        result.statusCode !== 200 &&
        !foundError
      ) {
        statusCode = result.statusCode;
      }
      if (result.headers) {
        loaderHeaders[id] = result.headers;
      }
    }
  });

  // 如果我们没有消耗挂起的操作错误(即，所有加载器都已解析)，那么在这里消耗它
  // If we didn't consume the pending action error (i.e., all loaders
  // resolved), then consume it here
  if (pendingError) {
    errors = pendingError;
  }

  return {
    loaderData, // 返回这个loader数据对象 // +++
    errors,
    statusCode: statusCode || 200,
    loaderHeaders,
  };
}

// 处理loader数据 // +++
function processLoaderData(
  state: RouterState,
  matches: AgnosticDataRouteMatch[],
  matchesToLoad: AgnosticDataRouteMatch[],
  results: DataResult[],
  pendingError: RouteData | undefined,
  revalidatingFetchers: RevalidatingFetcher[],
  fetcherResults: DataResult[],
  activeDeferreds: Map<string, DeferredData>
): {
  loaderData: RouterState["loaderData"];
  errors?: RouterState["errors"];
} {
  // 处理路由loader数据 // +++
  let { loaderData, errors } = processRouteLoaderData(
    matches,
    matchesToLoad, // +++
    results, // loaderResults // +++
    pendingError,
    activeDeferreds
  );
  // 这里实际上就是按照matchesToLoad筛选出来的匹配对象的路由对应的id属性以及结果的数据作为key-value存入一个空对象中 - 把这个对象作为loaderData

  // 处理来自我们重新验证的提取器的结果
  // Process results from our revalidating fetchers
  for (let index = 0; index < revalidatingFetchers.length; index++) {
    let [key, , match] = revalidatingFetchers[index];
    invariant(
      fetcherResults !== undefined && fetcherResults[index] !== undefined,
      "Did not find corresponding fetcher result"
    );
    let result = fetcherResults[index];

    // Process fetcher non-redirect errors
    if (isErrorResult(result)) {
      let boundaryMatch = findNearestBoundary(state.matches, match.route.id);
      if (!(errors && errors[boundaryMatch.route.id])) {
        errors = {
          ...errors,
          [boundaryMatch.route.id]: result.error,
        };
      }
      state.fetchers.delete(key);
    } else if (isRedirectResult(result)) {
      // Should never get here, redirects should get processed above, but we
      // keep this to type narrow to a success result in the else
      throw new Error("Unhandled fetcher revalidation redirect");
    } else if (isDeferredResult(result)) {
      // Should never get here, deferred data should be awaited for fetchers
      // in resolveDeferredResults
      throw new Error("Unhandled fetcher deferred data");
    } else {
      let doneFetcher: FetcherStates["Idle"] = {
        state: "idle",
        data: result.data,
        formMethod: undefined,
        formAction: undefined,
        formEncType: undefined,
        formData: undefined,
      };
      state.fetchers.set(key, doneFetcher);
    }
  }

  // 返回这个loaderData对象
  return { loaderData, errors };
}

function mergeLoaderData(
  loaderData: RouteData,
  newLoaderData: RouteData,
  matches: AgnosticDataRouteMatch[]
): RouteData {
  let mergedLoaderData = { ...newLoaderData };
  matches.forEach((match) => {
    let id = match.route.id;
    if (newLoaderData[id] === undefined && loaderData[id] !== undefined) {
      mergedLoaderData[id] = loaderData[id];
    }
  });
  return mergedLoaderData;
}

// Find the nearest error boundary, looking upwards from the leaf route (or the
// route specified by routeId) for the closest ancestor error boundary,
// defaulting to the root match
function findNearestBoundary(
  matches: AgnosticDataRouteMatch[],
  routeId?: string
): AgnosticDataRouteMatch {
  let eligibleMatches = routeId
    ? matches.slice(0, matches.findIndex((m) => m.route.id === routeId) + 1)
    : [...matches];
  return (
    eligibleMatches.reverse().find((m) => m.route.hasErrorBoundary === true) ||
    matches[0]
  );
}

// 获取短路匹配 // +++
function getShortCircuitMatches(
  routes: AgnosticDataRouteObject[],
  status: number,
  statusText: string
): {
  matches: AgnosticDataRouteMatch[];
  route: AgnosticDataRouteObject;
  error: ErrorResponse;
} {
  // 如果存在，则首选根布局路由，否则在路由对象中填充
  // Prefer a root layout route if present, otherwise shim in a route object
  let route = routes.find((r) => r.index || !r.path || r.path === "/" /** 路由有index属性 或 没有path属性 或 path属性值为/的 */) /** 当前只找数据路由的【第一层】 */ || {
    id: `__shim-${status}-route__`,
  }; // 没有否则直接准备一个对象 // +++

  // 返回一个对象 // +++
  return {
    // 匹配数组
    matches: [
      // 一个匹配对象
      {
        // 默认初始值 // +++
        params: {},
        pathname: "",
        pathnameBase: "",
        // 路由对象
        route,
      },
    ],
    // 上面处理后的路由对象 // +++
    route,
    // 错误对象
    error: new ErrorResponse(status, statusText, null), // 创建一个【错误响应】实例对象 // +++
  };
}

// 获取【找不到】匹配
function getNotFoundMatches(routes: AgnosticDataRouteObject[]) {
  // 获取短路匹配
  return getShortCircuitMatches(routes /** 数据路由 */, 404 /** 状态码 */, "Not Found" /** 状态码对应的文本 */); // 404 -> Not Found
}

function getMethodNotAllowedMatches(routes: AgnosticDataRouteObject[]) {
  return getShortCircuitMatches(routes, 405, "Method Not Allowed");
}

function getMethodNotAllowedResult(path: Location | string): ErrorResult {
  let href = typeof path === "string" ? path : createPath(path);
  console.warn(
    "You're trying to submit to a route that does not have an action.  To " +
      "fix this, please add an `action` function to the route for " +
      `[${href}]`
  );
  return {
    type: ResultType.error,
    error: new ErrorResponse(405, "Method Not Allowed", ""),
  };
}

// 从最低匹配项开始查找任何返回的重定向错误
// Find any returned redirect errors, starting from the lowest match
function findRedirect(results: DataResult[]): RedirectResult | undefined {
  // 倒序遍历查找
  for (let i = results.length - 1; i >= 0; i--) {
    let result = results[i];
    if (isRedirectResult(result)) { // 注意：一旦找到就return // +++
      return result;
    }
  }
}

function stripHashFromPath(path: To) {
  let parsedPath = typeof path === "string" ? parsePath(path) : path;
  return createPath({ ...parsedPath, hash: "" });
}

function isHashChangeOnly(a: Location, b: Location): boolean {
  return (
    a.pathname === b.pathname && a.search === b.search && a.hash !== b.hash
  );
}

function isDeferredResult(result: DataResult): result is DeferredResult {
  return result.type === ResultType.deferred;
}

function isErrorResult(result: DataResult): result is ErrorResult {
  return result.type === ResultType.error;
}

// 是否为重定向结果
function isRedirectResult(result?: DataResult): result is RedirectResult {
  return (result && result.type) === ResultType.redirect; // 查看type是否为【重定向】 // +++
}

function isRedirectResponse(result: any): result is Response {
  if (!(result instanceof Response)) {
    return false;
  }

  let status = result.status;
  let location = result.headers.get("Location");
  return status >= 300 && status <= 399 && location != null;
}

function isQueryRouteResponse(obj: any): obj is QueryRouteResponse {
  return (
    obj &&
    obj.response instanceof Response &&
    (obj.type === ResultType.data || ResultType.error)
  );
}

async function resolveDeferredResults(
  currentMatches: AgnosticDataRouteMatch[],
  matchesToLoad: AgnosticDataRouteMatch[],
  results: DataResult[],
  signal: AbortSignal,
  isFetcher: boolean,
  currentLoaderData?: RouteData
) {
  for (let index = 0; index < results.length; index++) {
    let result = results[index];
    let match = matchesToLoad[index];
    let currentMatch = currentMatches.find(
      (m) => m.route.id === match.route.id
    );
    let isRevalidatingLoader =
      currentMatch != null &&
      !isNewRouteInstance(currentMatch, match) &&
      (currentLoaderData && currentLoaderData[match.route.id]) !== undefined;

    if (isDeferredResult(result) && (isFetcher || isRevalidatingLoader)) {
      // Note: we do not have to touch activeDeferreds here since we race them
      // against the signal in resolveDeferredData and they'll get aborted
      // there if needed
      await resolveDeferredData(result, signal, isFetcher).then((result) => {
        if (result) {
          results[index] = result || results[index];
        }
      });
    }
  }
}

async function resolveDeferredData(
  result: DeferredResult,
  signal: AbortSignal,
  unwrap = false
): Promise<SuccessResult | ErrorResult | undefined> {
  let aborted = await result.deferredData.resolveData(signal);
  if (aborted) {
    return;
  }

  if (unwrap) {
    try {
      return {
        type: ResultType.data,
        data: result.deferredData.unwrappedData,
      };
    } catch (e) {
      // Handle any TrackedPromise._error values encountered while unwrapping
      return {
        type: ResultType.error,
        error: e,
      };
    }
  }

  return {
    type: ResultType.data,
    data: result.deferredData.data,
  };
}

function hasNakedIndexQuery(search: string): boolean {
  return new URLSearchParams(search).getAll("index").some((v) => v === "");
}

// Note: This should match the format exported by useMatches, so if you change
// this please also change that :)  Eventually we'll DRY this up
function createUseMatchesMatch(
  match: AgnosticDataRouteMatch,
  loaderData: RouteData
): UseMatchesMatch {
  let { route, pathname, params } = match;
  return {
    id: route.id,
    pathname,
    params,
    data: loaderData[route.id] as unknown,
    handle: route.handle as unknown,
  };
}

function getTargetMatch(
  matches: AgnosticDataRouteMatch[],
  location: Location | string
) {
  let search =
    typeof location === "string" ? parsePath(location).search : location.search;
  if (
    matches[matches.length - 1].route.index &&
    hasNakedIndexQuery(search || "")
  ) {
    // Return the leaf index route when index is present
    return matches[matches.length - 1];
  }
  // Otherwise grab the deepest "path contributing" match (ignoring index and
  // pathless layout routes)
  let pathMatches = getPathContributingMatches(matches);
  return pathMatches[pathMatches.length - 1];
}
//#endregion

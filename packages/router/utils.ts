import type { Location, Path, To } from "./history";
import { parsePath } from "./history";

/**
 * Map of routeId -> data returned from a loader/action/error
 */
export interface RouteData {
  [routeId: string]: any;
}

export enum ResultType {
  data = "data",
  deferred = "deferred",
  redirect = "redirect",
  error = "error",
}

/**
 * Successful result from a loader or action
 */
export interface SuccessResult {
  type: ResultType.data;
  data: any;
  statusCode?: number;
  headers?: Headers;
}

/**
 * Successful defer() result from a loader or action
 */
export interface DeferredResult {
  type: ResultType.deferred;
  deferredData: DeferredData;
}

/**
 * Redirect result from a loader or action
 */
export interface RedirectResult {
  type: ResultType.redirect;
  status: number;
  location: string;
  revalidate: boolean;
}

/**
 * Unsuccessful result from a loader or action
 */
export interface ErrorResult {
  type: ResultType.error;
  error: any;
  headers?: Headers;
}

/**
 * Result from a loader or action - potentially successful or unsuccessful
 */
export type DataResult =
  | SuccessResult
  | DeferredResult
  | RedirectResult
  | ErrorResult;

export type FormMethod = "get" | "post" | "put" | "patch" | "delete";
export type FormEncType =
  | "application/x-www-form-urlencoded"
  | "multipart/form-data";

/**
 * @private
 * Internal interface to pass around for action submissions, not intended for
 * external consumption
 */
export interface Submission {
  formMethod: Exclude<FormMethod, "get">;
  formAction: string;
  formEncType: FormEncType;
  formData: FormData;
}

/**
 * @private
 * Arguments passed to route loader/action functions.  Same for now but we keep
 * this as a private implementation detail in case they diverge in the future.
 */
interface DataFunctionArgs {
  request: Request;
  params: Params;
}

/**
 * Arguments passed to loader functions
 */
export interface LoaderFunctionArgs extends DataFunctionArgs {}

/**
 * Arguments passed to action functions
 */
export interface ActionFunctionArgs extends DataFunctionArgs {}

/**
 * Route loader function signature
 */
export interface LoaderFunction {
  (args: LoaderFunctionArgs): Promise<Response> | Response | Promise<any> | any;
}

/**
 * Route action function signature
 */
export interface ActionFunction {
  (args: ActionFunctionArgs): Promise<Response> | Response | Promise<any> | any;
}

/**
 * Route shouldRevalidate function signature.  This runs after any submission
 * (navigation or fetcher), so we flatten the navigation/fetcher submission
 * onto the arguments.  It shouldn't matter whether it came from a navigation
 * or a fetcher, what really matters is the URLs and the formData since loaders
 * have to re-run based on the data models that were potentially mutated.
 */
export interface ShouldRevalidateFunction {
  (args: {
    currentUrl: URL;
    currentParams: AgnosticDataRouteMatch["params"];
    nextUrl: URL;
    nextParams: AgnosticDataRouteMatch["params"];
    formMethod?: Submission["formMethod"];
    formAction?: Submission["formAction"];
    formEncType?: Submission["formEncType"];
    formData?: Submission["formData"];
    actionResult?: DataResult;
    defaultShouldRevalidate: boolean;
  }): boolean;
}

/**
 * Base RouteObject with common props shared by all types of routes
 */
type AgnosticBaseRouteObject = {
  caseSensitive?: boolean;
  path?: string;
  id?: string;
  loader?: LoaderFunction;
  action?: ActionFunction;
  hasErrorBoundary?: boolean;
  shouldRevalidate?: ShouldRevalidateFunction;
  handle?: any;
};

/**
 * Index routes must not have children
 */
export type AgnosticIndexRouteObject = AgnosticBaseRouteObject & {
  children?: undefined;
  index: true;
};

/**
 * Non-index routes may have children, but cannot have index
 */
export type AgnosticNonIndexRouteObject = AgnosticBaseRouteObject & {
  children?: AgnosticRouteObject[];
  index?: false;
};

/**
 * A route object represents a logical route, with (optionally) its child
 * routes organized in a tree-like structure.
 */
export type AgnosticRouteObject =
  | AgnosticIndexRouteObject
  | AgnosticNonIndexRouteObject;

export type AgnosticDataIndexRouteObject = AgnosticIndexRouteObject & {
  id: string;
};

export type AgnosticDataNonIndexRouteObject = AgnosticNonIndexRouteObject & {
  children?: AgnosticDataRouteObject[];
  id: string;
};

/**
 * A data route object, which is just a RouteObject with a required unique ID
 */
export type AgnosticDataRouteObject =
  | AgnosticDataIndexRouteObject
  | AgnosticDataNonIndexRouteObject;

// Recursive helper for finding path parameters in the absence of wildcards
type _PathParam<Path extends string> =
  // split path into individual path segments
  Path extends `${infer L}/${infer R}`
    ? _PathParam<L> | _PathParam<R>
    : // find params after `:`
    Path extends `${string}:${infer Param}`
    ? Param
    : // otherwise, there aren't any params present
      never;

/**
 * Examples:
 * "/a/b/*" -> "*"
 * ":a" -> "a"
 * "/a/:b" -> "b"
 * "/a/blahblahblah:b" -> "b"
 * "/:a/:b" -> "a" | "b"
 * "/:a/b/:c/*" -> "a" | "c" | "*"
 */
type PathParam<Path extends string> =
  // check if path is just a wildcard
  Path extends "*"
    ? "*"
    : // look for wildcard at the end of the path
    Path extends `${infer Rest}/*`
    ? "*" | _PathParam<Rest>
    : // look for params in the absence of wildcards
      _PathParam<Path>;

// Attempt to parse the given string segment. If it fails, then just return the
// plain string type as a default fallback. Otherwise return the union of the
// parsed string literals that were referenced as dynamic segments in the route.
export type ParamParseKey<Segment extends string> =
  // if could not find path params, fallback to `string`
  [PathParam<Segment>] extends [never] ? string : PathParam<Segment>;

/**
 * The parameters that were parsed from the URL path.
 */
export type Params<Key extends string = string> = {
  readonly [key in Key]: string | undefined;
};

/**
 * A RouteMatch contains info about how a route matched a URL.
 */
export interface AgnosticRouteMatch<
  ParamKey extends string = string,
  RouteObjectType extends AgnosticRouteObject = AgnosticRouteObject
> {
  /**
   * The names and values of dynamic parameters in the URL.
   */
  params: Params<ParamKey>;
  /**
   * The portion of the URL pathname that was matched.
   */
  pathname: string;
  /**
   * The portion of the URL pathname that was matched before child routes.
   */
  pathnameBase: string;
  /**
   * The route object that was used to match.
   */
  route: RouteObjectType;
}

export interface AgnosticDataRouteMatch
  extends AgnosticRouteMatch<string, AgnosticDataRouteObject> {}

// +++
// 是否为下标路由 // +++
function isIndexRoute(
  route: AgnosticRouteObject
): route is AgnosticIndexRouteObject {
  return route.index === true; // 直接取出路由的index属性是为===true // +++
}

// +++
// 遍历路由树，在必要的地方生成唯一的id，这样我们就可以单独使用路由器中的AgnosticDataRouteObject // AgnosticDataRouteObject: 不可知的数据路由对象 // +++
// Walk the route tree generating unique IDs where necessary so we are working
// solely with AgnosticDataRouteObject's within the Router
export function convertRoutesToDataRoutes( // 转换路由为【数据路由】 // Agnostic: 不可知论者
  routes: AgnosticRouteObject[],
  parentPath: number[] = [], // 父路径 - 默认为空数组
  allIds: Set<string> = new Set<string>() // 所有的id - 默认为一个空set
): AgnosticDataRouteObject[] {
  // 直接遍历路由
  return routes.map((route, index) => {
    let treePath = [...parentPath, index]; // 下标

    // 如果route上有id属性则直接使用id属性值
    // 若没有则使用treePath然后使用'-'做join拼接 // +++
    let id = typeof route.id === "string" ? route.id : treePath.join("-");

    /* 
    [...[], 0] -> [0]
    [...[], 0].join('-') -> '0'

    [...[], 0, 1] -> [0, 1]
    [...[], 0, 1].join('-') -> '0-1'
    */
    
    invariant(
      route.index !== true || !route.children,
      `Cannot specify children on an index route`
    );
    invariant(
      !allIds.has(id),
      `Found a route id collision on id "${id}".  Route ` +
        "id's must be globally unique within Data Router usages"
    );

    // set集合内增加这个id // +++
    allIds.add(id); // 主要是为了做上面的【唯一】筛查的

    // 当前路由使用下标路由
    /* 
    // 是否为下标路由 // +++
    function isIndexRoute(
      route: AgnosticRouteObject
    ): route is AgnosticIndexRouteObject {
      return route.index === true; // 直接取出路由的【index属性】是为===true // +++
    }
    */
    if (isIndexRoute(route)) {
      let indexRoute: AgnosticDataIndexRouteObject = { ...route, id }; // 浅拷贝 - 然后增加id属性
      return indexRoute; // 返回
    } else {
      // 不是下标路由则准备这个对象 - 也是浅拷贝 - 增加id属性 - 然后对路由的children再次进行递归性的convertRoutesToDataRoutes函数的执行
      let pathOrLayoutRoute: AgnosticDataNonIndexRouteObject = {
        ...route,
        id,
        children: route.children
          ? convertRoutesToDataRoutes(route.children, treePath, allIds)
          : undefined,
      };

      // 返回对象
      return pathOrLayoutRoute;
    }
  });
}

/**
 * 将给定的路由匹配到某个location并返回匹配数据。 // +++
 * Matches the given routes to a location and returns the match data.
 *
 * @see https://reactrouter.com/docs/en/v6/utils/match-routes
 */
export function matchRoutes<
  RouteObjectType extends AgnosticRouteObject = AgnosticRouteObject
>(
  routes: RouteObjectType[],
  locationArg: Partial<Location> | string,
  basename = "/" // 默认值为'/' // +++
): AgnosticRouteMatch<string, RouteObjectType>[] | null {

  // 是字符串将进行解析为{ pathname, search, hash }对象
  // 不是则直接使用
  let location =
    typeof locationArg === "string" ? parsePath(locationArg) : locationArg;

  // 脱掉基础名字 // +++
  let pathname = stripBasename(location.pathname || "/", basename);

  // export function stripBasename( // 脱掉基础名字
  //   pathname: string,
  //   basename: string
  // ): string | null {

  //   // basename为/则直接返回
  //   if (basename === "/") return pathname;

  //   // 两者都转为小写 - 然后前者不是以后者为开头的则直接返回null
  //   if (!pathname.toLowerCase().startsWith(basename.toLowerCase())) {
  //     return null;
  //   }

  //   // 我们希望在用户的控件中保留尾随斜杠行为，因此如果用户指定一个带尾随斜杠的基名，我们应该支持它 // +++
  //   // We want to leave trailing slash behavior in the user's control, so if they
  //   // specify a basename with a trailing slash, we should support it
  //   let startIndex = basename.endsWith("/")
  //     ? basename.length - 1
  //     : basename.length;
  //   // 后者是否以/结尾 ? 那么开始下标将保留这个/ : 那么直接跳过这个basename

  //   // 取出下一个字符
  //   let nextChar = pathname.charAt(startIndex);

  //   // 存在且不为/ - 那么说明pathname不以 basename/ 开头的
  //   if (nextChar && nextChar !== "/") {
  //     // 路径名不以 basename/ 开头
  //     // pathname does not start with basename/
  //     return null;
  //   }

  //   // 直接提取剩下的 - 若为空串则回退为/
  //   return pathname.slice(startIndex) || "/";
  // }

  // 这里的pathname为null则直接返回null // +++
  if (pathname == null) {
    return null;
  }

  /* 
  routes
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

  // 扁平化路由
  let branches = flattenRoutes(routes); // 其它的参数则采用默认值 // +++
  /* 
    深度优先 // +++
    先孩子 - 再自身
  */
  
  /* 
  branches
  [
    {
      path: '/contacts/:contactId',
      score: 17,
      routesMeta: [
        {
          relativePath: '/'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
        {
          relativePath: 'contacts/:contactId'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
      ]
    },
    {
      path: '/',
      score: 4,
      routesMeta: [
        {
          relativePath: '/'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
      ]
    },
  ]
  */

  /* 
  branches
  [
    {
      path: '/a/b/:xxx',
      score: 28, // '' a b :xxx -> 
      routesMeta: [
        {
          relativePath: '/'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
        {
          relativePath: 'a'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
        {
          relativePath: 'b/:xxx'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
      ]
    },
    {
      path: '/a',
      score: 13,
      routesMeta: [
        {
          relativePath: '/'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
        {
          relativePath: 'a'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
      ]
    },
    {
      path: '/c',
      score: 13,
      routesMeta: [
        {
          relativePath: '/'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
        {
          relativePath: 'c'
          caseSensitive: false,
          childrenIndex: 1,
          route, // 原路由对象
        },
      ]
    },
    {
      path: '/',
      score: 4,
      routesMeta: [
        {
          relativePath: '/'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
      ]
    },
    {
      path: '/d',
      score: 13,
      routesMeta: [
        {
          relativePath: '/d'
          caseSensitive: false,
          childrenIndex: 1,
          route, // 原路由对象
        },
      ]
    },
  ]
  */

  // 排序
  /* 
  分值不等直接高分优先
  相等则
    compareIndexes( // 实际上是查看这两个分支是否为兄弟路由，若是则谁所在的下标靠前那么谁就在前面，若不是则位置不会进行变化的 // +++
      // 每个分支对象的routesMeta属性直接映射出下标
      a.routesMeta.map((meta) => meta.childrenIndex), // 下标 -> [0, 0]
      b.routesMeta.map((meta) => meta.childrenIndex) // -> [0]
    )
  */
  
  /* 
  [0, 1].sort((a, b) => a - b) -> [0, 1]
  */
  rankRouteBranches(branches); // 对【每个branch对象】进行处理排序 // +++

  /* 
  branches
  [
    {
      path: '/contacts/:contactId',
      score: 17,
      routesMeta: [
        {
          relativePath: '/'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
        {
          relativePath: 'contacts/:contactId'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
      ]
    },
    {
      path: '/',
      score: 4,
      routesMeta: [
        {
          relativePath: '/'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
      ]
    },
  ]
  */

  /* 
  branches
  [
    {
      path: '/a/b/:xxx',
      score: 28, // '' a b :xxx -> 4+1+10+10+3 -> 28
      routesMeta: [
        {
          relativePath: '/'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
        {
          relativePath: 'a'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
        {
          relativePath: 'b/:xxx'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
      ]
    },
    {
      path: '/a',
      score: 13,
      routesMeta: [
        {
          relativePath: '/'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
        {
          relativePath: 'a'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
      ]
    },
    {
      path: '/c',
      score: 13,
      routesMeta: [
        {
          relativePath: '/'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
        {
          relativePath: 'c'
          caseSensitive: false,
          childrenIndex: 1,
          route, // 原路由对象
        },
      ]
    },
    // compareIndexes([0, 0], [0, 1]) -> 是兄弟路由 -> 那么谁所在下标靠前那么谁就在前 -> 0-1 -> 自然/a在/c的前面
    {
      path: '/d',
      score: 13,
      routesMeta: [
        {
          relativePath: '/d'
          caseSensitive: false,
          childrenIndex: 1,
          route, // 原路由对象
        },
      ]
    },
    {
      path: '/',
      score: 4,
      routesMeta: [
        {
          relativePath: '/'
          caseSensitive: false,
          childrenIndex: 0,
          route, // 原路由对象
        },
      ]
    },
  ]
  */

  let matches = null;
  // ++++++
  // 注意当前这个for循环（一旦matches有值了则直接退出for循环，然后把结果值返回就可啦 ~） // +++
  // ++++++
  for (let i = 0; matches == null && i < branches.length; ++i) { // 条件为matches==null && branches.length // +++

    // 匹配路由分支 // +++
    matches = matchRouteBranch<string, RouteObjectType>(
      // 每个分支
      branches[i],
      /* 
      举例：
      {
        path: '/a/b/:xxx',
        score: 28, // '' a b :xxx -> 4+1+10+10+3 -> 28
        routesMeta: [
          {
            relativePath: '/'
            caseSensitive: false,
            childrenIndex: 0,
            route, // 原路由对象
          },
          {
            relativePath: 'a'
            caseSensitive: false,
            childrenIndex: 0,
            route, // 原路由对象
          },
          {
            relativePath: 'b/:xxx'
            caseSensitive: false,
            childrenIndex: 0,
            route, // 原路由对象
          },
        ]
      },
      */
      // Incoming pathnames are generally encoded from either window.location
      // or from router.navigate, but we want to match against the unencoded
      // paths in the route definitions.  Memory router locations won't be
      // encoded here but there also shouldn't be anything to decode so this
      // should be a safe operation.  This avoids needing matchRoutes to be
      // history-aware.
      safelyDecodeURI(pathname) // 安全的解码pathname // +++ decodeURI api
      // 举例：/a/b/223
    );
  }

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

  // 返回matches // +++
  return matches;
}

interface RouteMeta<
  RouteObjectType extends AgnosticRouteObject = AgnosticRouteObject
> {
  relativePath: string;
  caseSensitive: boolean;
  childrenIndex: number;
  route: RouteObjectType;
}

interface RouteBranch<
  RouteObjectType extends AgnosticRouteObject = AgnosticRouteObject
> {
  path: string;
  score: number;
  routesMeta: RouteMeta<RouteObjectType>[];
}

// 扁平化路由 // +++
function flattenRoutes<
  RouteObjectType extends AgnosticRouteObject = AgnosticRouteObject
>(
  routes: RouteObjectType[],
  branches: RouteBranch<RouteObjectType>[] = [], // 默认值空数组 // +++
  parentsMeta: RouteMeta<RouteObjectType>[] = [], // 默认值空数组 // +++
  parentPath = "" // 默认值空串 // +++
): RouteBranch<RouteObjectType>[] {

  // 直接遍历这个routes数组 // +++
  routes.forEach((route, index) => {

    // 准备meta对象
    let meta: RouteMeta<RouteObjectType> = {
      relativePath: route.path || "", // 相对路径 - 就是路由对象的path属性 // +++
      caseSensitive: route.caseSensitive === true, // 是否区分大小写
      childrenIndex: index, // 当前这个route所在数组的下标
      route, // 整个的route对象 // +++
    };

    // 看一下这个相对路径是否以/开始的
    if (meta.relativePath.startsWith("/")) {
      // invariant: 不变的
      // value是false 或为 null 或 此值是一个undefined - 那么直接把message封装为一个Error类实例对象然后throw出去 // +++
      invariant(
        meta.relativePath.startsWith(parentPath), // 是否以空串''开始的
        `Absolute route path "${meta.relativePath}" nested under path ` +
          `"${parentPath}" is not valid. An absolute child route path ` +
          `must start with the combined path of all its parent routes.`
      );

      // 去除父路径 // +++
      meta.relativePath = meta.relativePath.slice(parentPath.length);
    }

    // 拼接路径 // +++
    let path = joinPaths([parentPath, meta.relativePath]); // ++++++ 拼接
    /* 
    export const joinPaths = (paths: string[]): string =>
      paths.join("/").replace(/\/\/+/g, "/");
    // 拼接路径 // +++
    // 以/连接形成字符串，之后全局替换//一个或多个为/

    ['', '/'].join('/') -> '//'
    */

    // +++
    // 注意这里使用的是concat函数 - 它会返回一个【新的数组引用】 // +++
    let routesMeta = parentsMeta.concat(meta); // ++++++ 连接

    // Add the children before adding this route to the array so we traverse the
    // route tree depth-first and child routes appear before their parents in
    // the "flattened" version.
    if (route.children && route.children.length > 0) { // 当前route是有孩子的 // +++
      invariant(
        // Our types know better, but runtime JS may not!
        // @ts-expect-error
        route.index !== true,
        `Index routes must not have child routes. Please remove ` +
          `all child routes from route path "${path}".`
      );

      /* 
      深度优先 // +++
      先孩子 - 再自身
      */

      // 那么则递归性的再次扁平化路由 // +++
      flattenRoutes(route.children, branches, routesMeta /** 连接 - 【新的数组引用】 */, path /** 拼接 */); // 递归执行flattenRoutes - 其它参数是处理后的 // +++
    }

    // Routes without a path shouldn't ever match by themselves unless they are
    // index routes, so don't add them to the list of possible branches.
    if (route.path == null && !route.index) { // 查看路由的path==null 且 路由对象没有index属性 - 则直接return // +++
      return;
    }

    // 最终这里直接把准备的【分支对象】推入branches数组中啦 ~
    branches.push({ path /** 拼接后的 */, score: computeScore(path, route.index) /** 计算得分（根据path以/分割的部分计算最终得分） +++ */, routesMeta /** 连接后的 - 【新的数组引用】 */ });
  });

  // 返回这个分支数组 // +++
  return branches;
}

// 排序 // +++
function rankRouteBranches(branches: RouteBranch[]): void {
  branches.sort((a, b) =>
    a.score !== b.score // 不一样的比分值
      ? b.score - a.score // Higher score first // 高分优先
      // 分值一样的比较下标 // +++
      : compareIndexes(
          // 每个分支对象的routesMeta属性直接映射出下标
          a.routesMeta.map((meta) => meta.childrenIndex), // 下标
          b.routesMeta.map((meta) => meta.childrenIndex)
        )
  );
  /* 
  [0, 1].sort((a, b) => a - b) -> [0, 1]
  */
}

// 动态参数正则表达式 // +++
// \w代表任意的字母、数字、下划线
const paramRe = /^:\w+$/; // 以:开始且后面是要有一个或多个然后结尾的 // +++
const dynamicSegmentValue = 3; // 动态部分值
const indexRouteValue = 2; // 下标路由值
const emptySegmentValue = 1; // 空部分值
const staticSegmentValue = 10; // 静态部分值
const splatPenalty = -2; // 惩罚 // +++
const isSplat = (s: string) => s === "*"; // 是*

// 计算得分 // +++
function computeScore(path: string, index: boolean | undefined): number {
  // 首先以/进行分割
  let segments = path.split("/"); // 得到【部分】数组
  /* 
  '/'.split('/') -> ['', '']
  '/contacts/:contactId'.split('/') -> ['', 'contacts', ':contactId']
  */

  let initialScore = segments.length; // 首先以数组的长度为初始分值 // +++
  // 查看【部分】数组中是否有*片段 // +++
  if (segments.some(isSplat)) {
    initialScore += splatPenalty; // 那么直接惩罚（降低）分值 // +++
  }

  // 是否为下标路由
  if (index) {
    initialScore += indexRouteValue; // 分值增加【下标路由值】
  }

  // 直接过滤然后统计最终分值
  return segments
    .filter((s) => !isSplat(s)) // 过滤出不是*片段的
    .reduce( // 然后做统计
      (score, segment) =>
        score +
        (paramRe.test(segment) // 是动态参数部分
          ? dynamicSegmentValue // 增加动态部分值
          : segment === "" // 片段是否为空串
          ? emptySegmentValue // 增加空串片段值
          : staticSegmentValue), // 增加静态片段值 // +++
      initialScore // 以现在的初始分值为初始值
    );
}

// 比较下标
function compareIndexes(a: number[], b: number[]): number {
  // 这两个分支是否为兄弟 // +++
  let siblings =
  // 查看两数组长度是否相等 且 前者去除最后一个元素的前部分的每一个值都与后者元素是相等的 - 此时才认为是兄弟路由
    a.length === b.length && a.slice(0, -1).every((n, i) => n === b[i]);

  /* 
  [0, 1].sort((a, b) => a - b) -> [0, 1]
  */

  return siblings
    // 如果两条路由是兄弟路由，我们应该先尝试匹配较早的兄弟路由。这允许人们对匹配行为进行细粒度控制，只需将具有相同路径的路由按他们希望尝试的顺序放置即可。
    ? // If two routes are siblings, we should try to match the earlier sibling
      // first. This allows people to have fine-grained control over the matching
      // behavior by simply putting routes with identical paths in the order they
      // want them tried.
      a[a.length - 1] - b[b.length - 1] // 前者最后一个索引值 - 后者最后一个索引值 // +++
      // 否则，按索引对非兄弟姐妹进行排序就没有意义了，所以它们是平等排序的。
    : // Otherwise, it doesn't really make sense to rank non-siblings by index,
      // so they sort equally.
      0; // +++ 那么就不动位置 - 也就是按照之前的位置不需要去动它就好啦 ~ // +++
}

// 匹配路由分支
function matchRouteBranch<
  ParamKey extends string = string,
  RouteObjectType extends AgnosticRouteObject = AgnosticRouteObject
>(
  branch: RouteBranch<RouteObjectType>,
  pathname: string
): AgnosticRouteMatch<ParamKey, RouteObjectType>[] | null {
  let { routesMeta } = branch; // 分支的路由元信息
  
  /* 
  举例：/a/b/223
  {
    path: '/a/b/:xxx',
    score: 28, // '' a b :xxx -> 4+1+10+10+3 -> 28
    routesMeta: [
      {
        relativePath: '/'
        caseSensitive: false,
        childrenIndex: 0,
        route, // 原路由对象
      },
      {
        relativePath: 'a'
        caseSensitive: false,
        childrenIndex: 0,
        route, // 原路由对象
      },
      {
        relativePath: 'b/:xxx'
        caseSensitive: false,
        childrenIndex: 0,
        route, // 原路由对象
      },
    ]
  },
  */

  // 已匹配的参数
  let matchedParams = {};
  // 已匹配的路径名
  let matchedPathname = "/"; // 默认值首先是/
  // 匹配到的结果
  let matches: AgnosticRouteMatch<ParamKey, RouteObjectType>[] = [];

  // +++
  // routesMeta表示的是这个分支对象所拼接形成的path在嵌套中的结构层次，但它是经过扁平化后的且是处理后的每个meta对象（这个meta对象其实就是对应route对象中一些属性的组合形成的对象 // +++） // +++

  /* 
  [
    {
      relativePath: '/'
      caseSensitive: false,
      childrenIndex: 0,
      route, // 原路由对象
    },
    {
      relativePath: 'a'
      caseSensitive: false,
      childrenIndex: 0,
      route, // 原路由对象
    },
    {
      relativePath: 'b/:xxx'
      caseSensitive: false,
      childrenIndex: 0,
      route, // 原路由对象
    },
  ]
  */

  // for循环直接【遍历路由元信息】 // +++
  for (let i = 0; i < routesMeta.length; ++i) {
    // 取出元信息对象
    let meta = routesMeta[i];
    // 当前元信息对象是否为末尾元素
    let end = i === routesMeta.length - 1;

    // 剩余路径名
    let remainingPathname =
      matchedPathname === "/" // 已匹配的路径名是否为/ // +++
        ? pathname // 直接pathname // +++
        : pathname.slice(matchedPathname.length) || "/"; // 否则让pathname直接跳过【已匹配的路径名】matchedPathname // +++

    // 匹配路径
    let match = matchPath(
      /* 
      这个meta对象其实就是对应route对象中一些属性的组合形成的对象
      */
      { path: meta.relativePath /** 相对路径 - 其实就是路由对象中的path属性值 // +++ */, caseSensitive: meta.caseSensitive /** 是否区分大小写 - 其实就是路由对象的caseSensitive属性值 */, end /** 当前是否为最后元素 */ },
      remainingPathname // 剩余路径名
    );

    /* 
    {
      path: '/',
      caseSensitive: false,
      end: false
    }
    remainingPathname: '/a/b/223'
    
    {
      path: 'a',
      caseSensitive: false,
      end: false
    }
    remainingPathname: '/a/b/223'

    {
      path: 'b/:xxx',
      caseSensitive: false,
      end: true
    }
    remainingPathname: '/b/223'
    */

    // +++
    // 没有匹配到则直接返回null // +++ 这是重点（记住一旦其中任意一个meta对象没有匹配到直接视为返回null // +++） // ++++++
    if (!match) return null; // ++++++

    /* 
    [/^\//i, []]
    [/^\/a(?:(?=\/|$))/i, []] // 严格注意最后面的\/|$表示的是^\/a\/或者^\/a$ // +++ 注意这个必须以a结尾的这个 - 格外要注意啦 ~
    [/^\/b\/([^\/]+)\/*$/i, ['xxx']]
    */

    /* 
    {
      params: {},
      pathname: '/'
      pathnameBase: ''
      pattern // 上方的对象 // +++
    }
    {
      params: {},
      pathname: '/a/'
      pathnameBase: '/a'
      pattern // 上方的对象 // +++
    }
    {
      params: {
        xxx: '223'
      },
      pathname: '/b/223'
      pathnameBase: '/b/223'
      pattern // 上方的对象 // +++
    }

    这个base实际上就是pathname的结尾/的前部分，若结尾没有/那么直接还是pathname
    当然对于/b/* -> /b/223来讲这个结论不全面，那么它的base首先按照上述结论改造然后就是去除*实际表示的那一部分，再接着应用上述结论达到最终的结果 -> 这个base就是/b啦 ~ // +++

    *只支持路径的结尾带*表示任意
    路径中间带*的仅仅只是它的字符本意就是一个*字符
    如果想在中间表示任意动态可以使用动态参数:xxx来表示，那么它代表除了/之外的其它字符一个或多个啦 ~
    */

    // 合并params对象 // +++
    Object.assign(matchedParams, match.params); // 就是动态参数对象 // +++

    // 元信息里存储的路由对象 // +++
    let route = meta.route;

    // 匹配结果推入【准备好的对象】
    matches.push({
      // TODO: Can this as be avoided?
      params: matchedParams as Params<ParamKey>, // 已匹配的params // +++
      pathname: joinPaths([matchedPathname, match.pathname]), // 拼接路径 // +++
      // export const joinPaths = (paths: string[]): string =>
      //   paths.join("/").replace(/\/\/+/g, "/");
      // // 拼接路径 // +++
      // // 以/连接形成字符串，之后全局替换//一个或多个为/

      // 序列化路径名
      pathnameBase: normalizePathname(
        joinPaths([matchedPathname, match.pathnameBase]) // 拼接路径
      ),
      // export const normalizePathname = (pathname: string): string =>
      //   pathname.replace(/\/+$/, "").replace(/^\/*/, "/");
      // // 序列化路径名 // +++
      // // 替换结尾的/一个或多个为空串，之后替换开头的/0个或多个为/

      // 路由对象
      route,
    });
    /* 
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

    // 匹配到的【路径名基础】不是'/'
    if (match.pathnameBase !== "/") {
      // 替换更新【已匹配到的路径名】 // +++
      matchedPathname = joinPaths([matchedPathname, match.pathnameBase]); // 拼接路径 // +++
    }
    /* 
    matchedPathname
    /
    /a
    /a/b/223
    */
  }

  // 返回匹配的结果 // +++
  return matches;
}

/**
 * Returns a path with params interpolated.
 *
 * @see https://reactrouter.com/docs/en/v6/utils/generate-path
 */
export function generatePath<Path extends string>(
  path: Path,
  params: {
    [key in PathParam<Path>]: string;
  } = {} as any
): string {
  return path
    .replace(/:(\w+)/g, (_, key: PathParam<Path>) => {
      invariant(params[key] != null, `Missing ":${key}" param`);
      return params[key]!;
    })
    .replace(/(\/?)\*/, (_, prefix, __, str) => {
      const star = "*" as PathParam<Path>;

      if (params[star] == null) {
        // If no splat was provided, trim the trailing slash _unless_ it's
        // the entire path
        return str === "/*" ? "/" : "";
      }

      // Apply the splat
      return `${prefix}${params[star]}`;
    });
}

/**
 * A PathPattern is used to match on some portion of a URL pathname.
 */
export interface PathPattern<Path extends string = string> {
  /**
   * A string to match against a URL pathname. May contain `:id`-style segments
   * to indicate placeholders for dynamic parameters. May also end with `/*` to
   * indicate matching the rest of the URL pathname.
   */
  path: Path;
  /**
   * Should be `true` if the static portions of the `path` should be matched in
   * the same case.
   */
  caseSensitive?: boolean;
  /**
   * Should be `true` if this pattern should match the entire URL pathname.
   */
  end?: boolean;
}

/**
 * A PathMatch contains info about how a PathPattern matched on a URL pathname.
 */
export interface PathMatch<ParamKey extends string = string> {
  /**
   * The names and values of dynamic parameters in the URL.
   */
  params: Params<ParamKey>;
  /**
   * The portion of the URL pathname that was matched.
   */
  pathname: string;
  /**
   * The portion of the URL pathname that was matched before child routes.
   */
  pathnameBase: string;
  /**
   * The pattern that was used to match.
   */
  pattern: PathPattern;
}

type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * 对URL路径名执行模式匹配并返回有关匹配的信息。 // +++
 * Performs pattern matching on a URL pathname and returns information about
 * the match.
 *
 * @see https://reactrouter.com/docs/en/v6/utils/match-path
 */
export function matchPath<
  ParamKey extends ParamParseKey<Path>,
  Path extends string
>(
  pattern: PathPattern<Path> | Path,
  pathname: string
): PathMatch<ParamKey> | null { // 匹配路径名
  if (typeof pattern === "string") {
    pattern = { path: pattern, caseSensitive: false /** 不区分大小写 */, end: true /** 是最后的 */ };
  }

  /* 
  {
    path: '/',
    caseSensitive: false,
    end: false
  }
  remainingPathname: '/a/b/223'
  
  {
    path: 'a',
    caseSensitive: false,
    end: false
  }
  remainingPathname: '/a/b/223'

  {
    path: 'b/:xxx',
    caseSensitive: false,
    end: true
  }
  remainingPathname: '/b/223'
  */

  // 编译路径 // +++
  let [matcher /** 正则表达式对象 */, paramNames] = compilePath(
    pattern.path,
    pattern.caseSensitive,
    pattern.end
  );

  /* 
  [/^\//i, []]
  [/^\/a(?:(?=\/|$))/i, []]
  [/^\/b\/([^\/]+)\/*$/i, ['xxx']]
  */

  let match = pathname.match(matcher); // 匹配正则表达式 // +++

  // 没有匹配则直接返回null // +++
  if (!match) return null;

  // 第一个匹配到的结果 - 匹配路径名
  let matchedPathname = match[0];


  let pathnameBase = matchedPathname.replace(/(.)\/+$/, "$1"); // (任意字符【一个】)分组1然后是/一个或多个结尾的替换为前面的分组1 - 实际上就是为了去除结尾的/一个或多个的 // +++
  // +++
  // 实际上这个基础base就是匹配到的路径名在不包含结尾/一个或多个的结果下的【前部分结果】 // +++
  // 如果结尾没有/一个或多个，那么这个base就是匹配到的路径名 // 这点要注意！！！ // +++

  // 捕获分组 // +++
  let captureGroups = match.slice(1); // 提取下标1之后的（包括自身）

  // 统计参数
  let params: Params = paramNames.reduce<Mutable<Params>>(
    (memo, paramName, index) => {
      // 我们需要在这里使用原始splat值来计算pathnameBase，而不是稍后使用params["*"]，因为它将在那时被解码
      // We need to compute the pathnameBase here using the raw splat value
      // instead of using params["*"] later because it will be decoded then
      if (paramName === "*") { // 是* // +++
        // 先取出值 // +++
        let splatValue = captureGroups[index] || "";

        pathnameBase = matchedPathname
          .slice(0, matchedPathname.length - splatValue.length) // 是*的话将不包括*表示的那一部分直接使用它的前部分即可
          .replace(/(.)\/+$/, "$1"); // 然后还是(任意字符【一个】)分组1然后是/一个或多个结尾的替换为前面的分组1 - 实际上就是为了去除结尾的/一个或多个的 // +++
          // +++
          // 实际上这个基础base就是匹配到的路径名在不包含结尾/一个或多个的结果下的【前部分结果】 // +++
          // 如果结尾没有/一个或多个，那么这个base就是匹配到的路径名 // 这点要注意！！！ // +++


          // +++
          // 实际上这里的处理是处理的这个base，因为上面的base是包含*实际表示的那一部分的（比如这里的223它是包含的），那么这里做的的就是去除这一部分（去除223）
          // 然后结尾有/一个或多个的那么直接采取前部分，若结尾没有那么直接还就是这个 // +++（那么这里又去除/所以按照这个例子（/b/*）的话这里的base就应该是'/b'，而不是上面的'/b/223'（它是在/b/:xxx下形成有的） ~）
      }
      // 这里的if并没有return，还是接着下面的memo对象的赋值操作啦 ~

      // +++
      memo[paramName] = safelyDecodeURIComponent(
        captureGroups[index] || "",
        paramName
      );
      return memo;
    },
    {}
  );

  /* 
  {
    params: {},
    pathname: '/'
    pathnameBase: ''
    pattern // 上方的对象 // +++
  }
  {
    params: {},
    pathname: '/a/'
    pathnameBase: '/a'
    pattern // 上方的对象 // +++
  }
  {
    params: {
      xxx: '223'
    },
    pathname: '/b/223'
    pathnameBase: '/b/223'
    pattern // 上方的对象 // +++
  }

  这个base实际上就是pathname的结尾/的前部分，若结尾没有/那么直接还是pathname
  当然对于/b/* -> /b/223来讲这个结论不全面，那么它的base首先按照上述结论改造然后就是去除*实际表示的那一部分，再接着应用上述结论达到最终的结果 -> 这个base就是/b啦 ~ // +++

  *只支持路径的结尾带*表示任意
  路径中间带*的仅仅只是它的字符本意就是一个*字符
  如果想在中间表示任意动态可以使用动态参数:xxx来表示，那么它代表除了/之外的其它字符一个或多个啦 ~
  */

  // 返回一个对象
  return {
    params, // 参数
    pathname: matchedPathname, // 基础名字
    pathnameBase, // 路径名基础
    pattern, // pattern对象
  };
}

// 编译路径 // +++
function compilePath(
  path: string,
  caseSensitive = false, // 默认为【不】区分大小写 // +++
  end = true // 是最后的 // +++
): [RegExp, string[]] {
  warning(
    path === "*" || !path.endsWith("*") || path.endsWith("/*"),
    `Route path "${path}" will be treated as if it were ` +
      `"${path.replace(/\*$/, "/*")}" because the \`*\` character must ` +
      `always follow a \`/\` in the pattern. To get rid of this warning, ` +
      `please change the route path to "${path.replace(/\*$/, "/*")}".`
  );

  // 参数名字
  let paramNames: string[] = []; // +++

  /* 
  https://c.runoob.com/front-end/854/
  https://wangdoc.com/javascript/stdlib/regexp
  */

  // 正则源 // +++
  let regexpSource =
    "^" +
    path
      // 替换/* * / // //*【也可以没有】诸如此类【结尾的】为空串
      .replace(/\/*\*?$/, "") // Ignore trailing / and /*, we'll handle it below // 忽略尾随的 / 和 /*，我们将在下面处理
      // 替换【开头】/ // ///【也可以没有】诸如此类为'/'
      .replace(/^\/*/, "/") // Make sure it has a leading / // 确保它有一个领先的 / // ++++++
      // ''.replace(/^\/*/, '/') -> '/' // ++++++

      /* 
      *表示0个或多个
      +表示1个或多个
      */
      
      // 全局替换特殊的正则表达式字符 \ . * + ^ $ ?为转义后的\\ \. \* \+ \^ \$ \?
      .replace(/[\\.*+^$?{}|()[\]]/g, "\\$&") // Escape special regex chars // 转义特殊的正则表达式字符 \ . * + ^ $ ?
      // https://wangdoc.com/javascript/stdlib/regexp#stringprototypereplace
      // $&：匹配的子字符串。
      /* 
      https://c.runoob.com/front-end/854/

      /[\.*]/g -> \.* -> 替换为0 -> \00
      /[\\.*]/g -> \.* -> 替换为0 -> 000

      '\$&' 在字符串中其实是$&
      '\\$&' 在字符串中其实是\$&

      /[\\.*+?]/g -> +?* -> 替换为\$& -> \+\?\*
      */
      .replace(/:(\w+)/g /** :任意字母、数字、下划线一个或以上 - 全局匹配 */, (_: string, paramName: string) => {
        paramNames.push(paramName); // 收集这个分组1也就是参数名 // +++
        return "([^\\/]+)"; // 除了/之外的字符一个或以上分组 // +++
        // https://c.runoob.com/front-end/854/
        // /([^\/]+)/ -> \.*/ -> 替换为0 -> 0/
      });

  // +++
  if (path.endsWith("*")) { // 是否已*结尾 // +++
    paramNames.push("*"); // 参数名中推入* // +++
    regexpSource +=
      path === "*" || path === "/*" // path是* 或者 是/* // +++
        // 任意字符0个或多个结尾的 // +++
        ? "(.*)$" // Already matched the initial /, just match the rest // 已经匹配了首字母/，只匹配其余部分
        // /任意字符一个或多个 或者 /0个或多个 这种结尾的 // +++
        : "(?:\\/(.+)|\\/*)$"; // Don't include the / in params["*"] // 不要在 params["*"] 中包含 /
  } else if (end) {
    // 匹配到末尾时，忽略尾部斜杠
    // When matching to the end, ignore trailing slashes
    regexpSource += "\\/*$"; // \/*$ -> 意为/ // 【也可以没有】结尾的
  } else if (path !== "" && path !== "/") { // path不是空串 且 不是 '/' // +++
    // If our path is non-empty and contains anything beyond an initial slash,
    // then we have _some_ form of path in our regex so we should expect to
    // match only if we find the end of this path segment.  Look for an optional
    // non-captured trailing slash (to match a portion of the URL) or the end
    // of the path (if we've matched to the end).  We used to do this with a
    // word boundary but that gives false positives on routes like
    // /user-preferences since `-` counts as a word boundary.
    regexpSource += "(?:(?=\\/|$))"; // 这个y就表示/或者结尾 // +++
    /* 
    非捕获组

(?:x)称为非捕获组（Non-capturing group），表示不返回该组匹配的内容，即匹配的结果中不计入这个括号。

非捕获组的作用请考虑这样一个场景，假定需要匹配foo或者foofoo，正则表达式就应该写成/(foo){1, 2}/，但是这样会占用一个组匹配。这时，就可以使用非捕获组，将正则表达式改为/(?:foo){1, 2}/，它的作用与前一个正则是一样的，但是不会单独输出括号内部的内容。

请看下面的例子。

var m = 'abc'.match(/(?:.)b(.)/);
m // ["abc", "c"]
上面代码中的模式，一共使用了两个括号。其中第一个括号是非捕获组，所以最后返回的结果中没有第一个括号，只有第二个括号匹配的内容。
    */

    /* 
    https://wangdoc.com/javascript/stdlib/regexp#组匹配

    先行断言

x(?=y)称为先行断言（Positive look-ahead），x只有在y前面才匹配，y不会被计入返回结果。比如，要匹配后面跟着百分号的数字，可以写成/\d+(?=%)/。

“先行断言”中，括号里的部分是不会返回的。

var m = 'abc'.match(/b(?=c)/);
m // ["b"]
上面的代码使用了先行断言，b在c前面所以被匹配，但是括号对应的c不会被返回。
    */
  } else {
    // Nothing to match for "" or "/" // 没有匹配""或"/"的内容
  }

  // 生成正则表达式对象
  let matcher = new RegExp(regexpSource, caseSensitive ? undefined : "i" /** 修饰符是否有忽略大小写 // +++ */);

  // 返回匹配器（正则表达式对象实例）和收集到的参数名
  return [matcher, paramNames];
}

// 安全解码
function safelyDecodeURI(value: string) {
  try {
    return decodeURI(value); // +++
  } catch (error) {
    warning(
      false,
      `The URL path "${value}" could not be decoded because it is is a ` +
        `malformed URL segment. This is probably due to a bad percent ` +
        `encoding (${error}).`
    );

    return value;
  }
}

// 这两个实际就是使用try catch包裹一下 // +++

// 安全解码
function safelyDecodeURIComponent(value: string, paramName: string) {
  try {
    return decodeURIComponent(value); // +++
  } catch (error) {
    warning(
      false,
      `The value for the URL param "${paramName}" will not be decoded because` +
        ` the string "${value}" is a malformed URL segment. This is probably` +
        ` due to a bad percent encoding (${error}).`
    );

    return value;
  }
}

/**
 * @private
 */
export function stripBasename( // 脱掉基础名字
  pathname: string,
  basename: string
): string | null {

  // basename为/则直接返回
  if (basename === "/") return pathname;

  // 两者都转为小写 - 然后前者不是以后者为开头的则直接返回null
  if (!pathname.toLowerCase().startsWith(basename.toLowerCase())) {
    return null;
  }

  // 我们希望在用户的控件中保留尾随斜杠行为，因此如果用户指定一个带尾随斜杠的基名，我们应该支持它 // +++
  // We want to leave trailing slash behavior in the user's control, so if they
  // specify a basename with a trailing slash, we should support it
  let startIndex = basename.endsWith("/")
    ? basename.length - 1
    : basename.length;
  // 后者是否以/结尾 ? 那么开始下标将保留这个/ : 那么直接跳过这个basename

  // 取出下一个字符
  let nextChar = pathname.charAt(startIndex);

  // 存在且不为/ - 那么说明pathname不以 basename/ 开头的
  if (nextChar && nextChar !== "/") {
    // 路径名不以 basename/ 开头
    // pathname does not start with basename/
    return null;
  }

  // 直接提取剩下的 - 若为空串则回退为/
  return pathname.slice(startIndex) || "/";
}

/**
 * @private
 */
export function invariant(value: boolean, message?: string): asserts value;
export function invariant<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T;
export function invariant(value: any, message?: string) { // invariant: 不变的
  // value是false 或为 null 或 此值是一个undefined - 那么直接把message封装为一个Error类实例对象然后throw出去 // +++
  if (value === false || value === null || typeof value === "undefined") {
    throw new Error(message); // +++
  }
}

/**
 * @private
 */
export function warning(cond: any, message: string): void {
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

/**
 * 返回相对于给定路径名的已解析路径对象。
 * Returns a resolved path object relative to the given pathname.
 *
 * @see https://reactrouter.com/docs/en/v6/utils/resolve-path
 */
export function resolvePath(to: To, fromPathname = "/" /** 默认为/ */): Path { // 解析路径
  let {
    pathname: toPathname, // 取出路径名
    search = "",
    hash = "",
  } = typeof to === "string" ? parsePath(to) /** 解析路径 */ : to;

  let pathname = toPathname // 有无去路径名
    ? toPathname.startsWith("/") // 路径名是否以/开始的 - 表示不是相对的直接就是一个新的
      ? toPathname // 那么直接是去路径名
      //不是/开始的表示相对的那么需要和form进行拼接的 // +++
      : resolvePathname(toPathname, fromPathname) // 解析路径名 - 主要是进行和from以及to进行拼接的 - 里面牵扯到../ ./一些语法格式的处理
    : fromPathname; // 这里回退到from路径名 // +++

  return {
    pathname, // 最终的路径名 // +++
    search: normalizeSearch(search), // 序列化search // +++ 主要就是确保?的
    hash: normalizeHash(hash), // 序列化hash // +++ 主要就是确保#的
  };
}

// 解析路径名
function resolvePathname(relativePath: string, fromPathname: string): string {
  let segments = fromPathname.replace(/\/+$/, "").split("/"); // 替换尾部/一个或多个为空串 - 然后以/进行分割 // +++ 用来下面再次进行拼接的 // +++
  let relativeSegments = relativePath.split("/"); // 以/进行分割 // 下面遍历

  // 遍历相对部分数组
  relativeSegments.forEach((segment) => {
    // ../ 要去的部分中有.. 那么需要把from末尾弹出一个以表示上一级 // +++
    if (segment === "..") { // 是否为.. // +++
      // 保留根 "" 段，以便路径名从 / 开始
      // Keep the root "" segment so the pathname starts at /
      if (segments.length > 1) segments.pop(); // 长度是否>1则pop出去
    } else if (segment !== ".") { // 不是.的 // 不是./ 是xxx/
      segments.push(segment); // 推入进来 // +++
    }
    // +++ 整体的逻辑
    // 省略掉./这样的因为它就表示from当前
    // ../这样的需要from弹出末尾一个以表示上一级
    // xxx/这种直接拼接到from的后面即可啦 ~
    // +++
  });

  // 以/拼接from部分数组以表示最终的路径 // +++
  return segments.length > 1 ? segments.join("/") : "/"; // 回退为/
}

function getInvalidPathError(
  char: string,
  field: string,
  dest: string,
  path: Partial<Path>
) {
  return (
    `Cannot include a '${char}' character in a manually specified ` +
    `\`to.${field}\` field [${JSON.stringify(
      path
    )}].  Please separate it out to the ` +
    `\`to.${dest}\` field. Alternatively you may provide the full path as ` +
    `a string in <Link to="..."> and the router will parse it for you.`
  );
}

/**
 * @private
 *
 * When processing relative navigation we want to ignore ancestor routes that
 * do not contribute to the path, such that index/pathless layout routes don't
 * interfere.
 *
 * For example, when moving a route element into an index route and/or a
 * pathless layout route, relative link behavior contained within should stay
 * the same.  Both of the following examples should link back to the root:
 *
 *   <Route path="/">
 *     <Route path="accounts" element={<Link to=".."}>
 *   </Route>
 *
 *   <Route path="/">
 *     <Route path="accounts">
 *       <Route element={<AccountsLayout />}>       // <-- Does not contribute
 *         <Route index element={<Link to=".."} />  // <-- Does not contribute
 *       </Route
 *     </Route>
 *   </Route>
 */
export function getPathContributingMatches<
  T extends AgnosticRouteMatch = AgnosticRouteMatch
>(matches: T[]) { // 获取路径贡献匹配
  // 其实就是过滤出匹配数组中第一个匹配元素还有匹配元素对应的route源对象的path属性值是有的且长度>0的也就是不为空串 // +++
  return matches.filter(
    (match, index) =>
      index === 0 || (match.route.path && match.route.path.length > 0) // +++
  );
}

/**
 * @private
 */
export function resolveTo(
  toArg: To,
  routePathnames: string[],
  locationPathname: string,
  isPathRelative = false // 路径是否为相对的 -> 默认为false
): Path {
  let to: Partial<Path>;
  if (typeof toArg === "string") {
    to = parsePath(toArg); // 字符串则直接进行解析路径啦 ~ 还是解析为{pathname, search, hash}这样格式的对象 // +++
  } else {
    to = { ...toArg }; // 浅拷贝一下

    invariant(
      !to.pathname || !to.pathname.includes("?"),
      getInvalidPathError("?", "pathname", "search", to)
    );
    invariant(
      !to.pathname || !to.pathname.includes("#"),
      getInvalidPathError("#", "pathname", "hash", to)
    );
    invariant(
      !to.search || !to.search.includes("#"),
      getInvalidPathError("#", "search", "hash", to)
    );
  }

  // 是否为空串路径
  let isEmptyPath = toArg === "" || to.pathname === "";
  // 去的路径名
  let toPathname = isEmptyPath ? "/" : to.pathname; // 是空串路径则回退为/否则还就是to的pathname属性值 // +++

  // 准备from
  let from: string;

  // Routing is relative to the current pathname if explicitly requested.
  //
  // If a pathname is explicitly provided in `to`, it should be relative to the
  // route context. This is explained in `Note on `<Link to>` values` in our
  // migration guide from v5 as a means of disambiguation between `to` values
  // that begin with `/` and those that do not. However, this is problematic for
  // `to` values that do not provide a pathname. `to` can simply be a search or
  // hash string, in which case we should assume that the navigation is relative
  // to the current location's pathname and *not* the route pathname.
  if (isPathRelative || toPathname == null) { // 路径是否为相对的 或者 去的路径名==null // +++
    from = locationPathname; // 那么from为当前location对象的pathname属性值 // +++
  } else {
    let routePathnameIndex = routePathnames.length - 1; // 数组的最后一个元素的下标 // +++

    // 去的路径名若以..开始的
    if (toPathname.startsWith("..")) {
      // 得到去的部分数组
      let toSegments = toPathname.split("/"); // 先按照/进行分割 // +++

      // Each leading .. segment means "go up one route" instead of "go up one
      // URL segment".  This is a key difference from how <a href> works and a
      // major reason we call this a "to" value instead of a "href".
      while (toSegments[0] === "..") { // 只要这个数组的第一个元素的值为'..'那么就循环开始
        toSegments.shift(); // 删除数组的第一个元素
        routePathnameIndex -= 1; // 下标减1
      }
      // 这是用来决定上一级是谁的 - 这个下标 // +++

      // 然后再按照/进行拼接赋值给to的pathname属性 // +++
      to.pathname = toSegments.join("/"); // 这是去除了to中..之后再组合的路径，但是需要注意的是开头就没有了/了，那么这样就会影响下面的resolvePath逻辑会造成最终的pathname就需要和from进行拼接啦 ~ // +++
    }

    // 如果".."段比父路由多，则相对于根/ URL解析。 // +++
    // If there are more ".." segments than parent routes, resolve relative to
    // the root / URL.
    from = routePathnameIndex >= 0 ? routePathnames[routePathnameIndex] /** 直接是取这个位置的路径名作为from */ : "/" /** 最终是回退到/吧 ~ */;
  }
  // 这段逻辑是在准备from参数 // +++
  // 主要是to这里支持../xxx这样的写法，所以需要确定from在面对..时的上一级是谁，然后还需要删除to中..这样的格式字符串的然后最终整合最终to字符串

  // 解析路径
  let path = resolvePath(to, from);
  // 这个的函数的主要逻辑 // +++
  // +++
  // 对应to若是以/开始的那么直接就是to
  // 若to不是以/开始的那么需要和from进行拼接返回最终的pathname的 // +++
  // +++

  // 下面这段逻辑是决定最终的pathname末尾是否拼接/这个字符的 // +++

  // 如果原来的"to"有一个，请确保路径名有一个尾部斜杠
  // Ensure the pathname has a trailing slash if the original "to" had one
  let hasExplicitTrailingSlash = // 是否有明确的尾部斜杠 // +++
    toPathname && toPathname !== "/" && toPathname.endsWith("/");
  
  // 或者如果这是指向当前路径的链接，该路径有一个尾部斜杠
  // Or if this was a link to the current path which has a trailing slash
  let hasCurrentTrailingSlash = // 是否有当前的尾部斜杠
    (isEmptyPath || toPathname === ".") && locationPathname.endsWith("/");

  // 用来决定pathname的尾部是否拼接/的
  if (
    !path.pathname.endsWith("/") /** 目前这个路径末尾不是以/结尾的 */ && // 且
    (hasExplicitTrailingSlash || hasCurrentTrailingSlash) // 有明确的末尾斜杠 或 有当前的末尾斜杠 // +++
  ) {
    path.pathname += "/"; // 直接在路径末尾拼接/即可啦 ~
  }

  // 返回这个path对象 // +++
  return path;
}

/**
 * @private
 */
export function getToPathname(to: To): string | undefined {
  // Empty strings should be treated the same as / paths
  return to === "" || (to as Path).pathname === ""
    ? "/"
    : typeof to === "string"
    ? parsePath(to).pathname
    : to.pathname;
}

/**
 * @private
 */
export const joinPaths = (paths: string[]): string =>
  paths.join("/").replace(/\/\/+/g, "/");
// 拼接路径 // +++
// 以/连接形成字符串，之后全局替换//一个或多个为/

/**
 * @private
 */
export const normalizePathname = (pathname: string): string =>
  pathname.replace(/\/+$/, "").replace(/^\/*/, "/");
// 序列化路径名 // +++
// 替换结尾的/一个或多个为空串，之后替换开头的/0个或多个为/

/**
 * @private
 */
export const normalizeSearch = (search: string): string =>
  !search || search === "?"
    ? "" // 空串
    : search.startsWith("?") // 以?开始的
    ? search // search
    : "?" + search; // 开头拼接?
// 序列化search
// 主要就是确保?

/**
 * @private
 */
export const normalizeHash = (hash: string): string =>
  !hash || hash === "#" ? "" /** 空串 */ : hash.startsWith("#") ? hash /** 还是hash */ : "#" + hash /** 否则拼接一个# */;
// 序列化hash
// 主要就是确保#的

export type JsonFunction = <Data>(
  data: Data,
  init?: number | ResponseInit
) => Response;

/**
 * This is a shortcut for creating `application/json` responses. Converts `data`
 * to JSON and sets the `Content-Type` header.
 */
export const json: JsonFunction = (data, init = {}) => {
  let responseInit = typeof init === "number" ? { status: init } : init;

  let headers = new Headers(responseInit.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(data), {
    ...responseInit,
    headers,
  });
};

export interface TrackedPromise extends Promise<any> {
  _tracked?: boolean;
  _data?: any;
  _error?: any;
}

export class AbortedDeferredError extends Error {}

export class DeferredData {
  private pendingKeys: Set<string | number> = new Set<string | number>();
  private controller: AbortController;
  private abortPromise: Promise<void>;
  private unlistenAbortSignal: () => void;
  private subscriber?: (aborted: boolean) => void = undefined;
  data: Record<string, unknown>;

  constructor(data: Record<string, unknown>) {
    invariant(
      data && typeof data === "object" && !Array.isArray(data),
      "defer() only accepts plain objects"
    );

    // Set up an AbortController + Promise we can race against to exit early
    // cancellation
    let reject: (e: AbortedDeferredError) => void;
    this.abortPromise = new Promise((_, r) => (reject = r));
    this.controller = new AbortController();
    let onAbort = () =>
      reject(new AbortedDeferredError("Deferred data aborted"));
    this.unlistenAbortSignal = () =>
      this.controller.signal.removeEventListener("abort", onAbort);
    this.controller.signal.addEventListener("abort", onAbort);

    this.data = Object.entries(data).reduce(
      (acc, [key, value]) =>
        Object.assign(acc, {
          [key]: this.trackPromise(key, value),
        }),
      {}
    );
  }

  private trackPromise(
    key: string | number,
    value: Promise<unknown> | unknown
  ): TrackedPromise | unknown {
    if (!(value instanceof Promise)) {
      return value;
    }

    this.pendingKeys.add(key);

    // We store a little wrapper promise that will be extended with
    // _data/_error props upon resolve/reject
    let promise: TrackedPromise = Promise.race([value, this.abortPromise]).then(
      (data) => this.onSettle(promise, key, null, data as unknown),
      (error) => this.onSettle(promise, key, error as unknown)
    );

    // Register rejection listeners to avoid uncaught promise rejections on
    // errors or aborted deferred values
    promise.catch(() => {});

    Object.defineProperty(promise, "_tracked", { get: () => true });
    return promise;
  }

  private onSettle(
    promise: TrackedPromise,
    key: string | number,
    error: unknown,
    data?: unknown
  ): unknown {
    if (
      this.controller.signal.aborted &&
      error instanceof AbortedDeferredError
    ) {
      this.unlistenAbortSignal();
      Object.defineProperty(promise, "_error", { get: () => error });
      return Promise.reject(error);
    }

    this.pendingKeys.delete(key);

    if (this.done) {
      // Nothing left to abort!
      this.unlistenAbortSignal();
    }

    const subscriber = this.subscriber;
    if (error) {
      Object.defineProperty(promise, "_error", { get: () => error });
      subscriber && subscriber(false);
      return Promise.reject(error);
    }

    Object.defineProperty(promise, "_data", { get: () => data });
    subscriber && subscriber(false);
    return data;
  }

  subscribe(fn: (aborted: boolean) => void) {
    this.subscriber = fn;
  }

  cancel() {
    this.controller.abort();
    this.pendingKeys.forEach((v, k) => this.pendingKeys.delete(k));
    let subscriber = this.subscriber;
    subscriber && subscriber(true);
  }

  async resolveData(signal: AbortSignal) {
    let aborted = false;
    if (!this.done) {
      let onAbort = () => this.cancel();
      signal.addEventListener("abort", onAbort);
      aborted = await new Promise((resolve) => {
        this.subscribe((aborted) => {
          signal.removeEventListener("abort", onAbort);
          if (aborted || this.done) {
            resolve(aborted);
          }
        });
      });
    }
    return aborted;
  }

  get done() {
    return this.pendingKeys.size === 0;
  }

  get unwrappedData() {
    invariant(
      this.data !== null && this.done,
      "Can only unwrap data on initialized and settled deferreds"
    );

    return Object.entries(this.data).reduce(
      (acc, [key, value]) =>
        Object.assign(acc, {
          [key]: unwrapTrackedPromise(value),
        }),
      {}
    );
  }
}

function isTrackedPromise(value: any): value is TrackedPromise {
  return (
    value instanceof Promise && (value as TrackedPromise)._tracked === true
  );
}

function unwrapTrackedPromise(value: any) {
  if (!isTrackedPromise(value)) {
    return value;
  }

  if (value._error) {
    throw value._error;
  }
  return value._data;
}

export function defer(data: Record<string, unknown>) {
  return new DeferredData(data);
}

export type RedirectFunction = (
  url: string,
  init?: number | ResponseInit
) => Response;

/**
 * 重定向响应。设置状态代码和"位置"标头。
 * 默认"302 Found"
 * A redirect response. Sets the status code and the `Location` header.
 * Defaults to "302 Found".
 */
export const redirect: RedirectFunction = (url, init = 302 /** 默认302 */) => { // 重定向 // +++
  let responseInit = init;
  if (typeof responseInit === "number") {
    responseInit = { status: responseInit };
  } else if (typeof responseInit.status === "undefined") {
    responseInit.status = 302;
  }
  // 状态码的设置 // +++

  // 造一个Headers对象
  let headers = new Headers(responseInit.headers); // 额外的、用户设置的头 // +++
  headers.set("Location", url); // 设置Location头属性 // +++

  // +++
  // 返回一个Response实例对象 - 这样在handleLoaders -> callLoadersAndMaybeResolveData -> callLoaderOrAction就会针对这个Response结果做相应的转换处理啦 ~
  // 这样在最终的handleLoaders函数中就会【倒序】查找是否有【重定向】，之后就会startRedirectNavigation -> startNavigation
  // 之后对后续的逻辑就会产生一个【短路】 // +++
  // +++
  return new Response(null, {
    ...responseInit,
    headers,
  });
};

/**
 * @private
 * Utility class we use to hold auto-unwrapped 4xx/5xx Response bodies
 */
export class ErrorResponse {
  status: number;
  statusText: string;
  data: any;

  constructor(status: number, statusText: string | undefined, data: any) {
    this.status = status;
    this.statusText = statusText || "";
    this.data = data;
  }
}

/**
 * Check if the given error is an ErrorResponse generated from a 4xx/5xx
 * Response throw from an action/loader
 */
export function isRouteErrorResponse(e: any): e is ErrorResponse {
  return e instanceof ErrorResponse;
}

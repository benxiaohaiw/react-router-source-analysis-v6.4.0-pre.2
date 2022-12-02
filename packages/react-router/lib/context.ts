import * as React from "react";
import type {
  AgnosticRouteMatch,
  AgnosticIndexRouteObject,
  AgnosticNonIndexRouteObject,
  History,
  Location,
  Router,
  StaticHandlerContext,
  To,
  TrackedPromise,
} from "@remix-run/router";
import type { Action as NavigationType } from "@remix-run/router";

// Create react-specific types from the agnostic types in @remix-run/router to
// export from react-router
export interface IndexRouteObject {
  caseSensitive?: AgnosticIndexRouteObject["caseSensitive"];
  path?: AgnosticIndexRouteObject["path"];
  id?: AgnosticIndexRouteObject["id"];
  loader?: AgnosticIndexRouteObject["loader"];
  action?: AgnosticIndexRouteObject["action"];
  hasErrorBoundary?: AgnosticIndexRouteObject["hasErrorBoundary"];
  shouldRevalidate?: AgnosticIndexRouteObject["shouldRevalidate"];
  handle?: AgnosticIndexRouteObject["handle"];
  index: true;
  children?: undefined;
  element?: React.ReactNode | null;
  errorElement?: React.ReactNode | null;
}

export interface NonIndexRouteObject {
  caseSensitive?: AgnosticNonIndexRouteObject["caseSensitive"];
  path?: AgnosticNonIndexRouteObject["path"];
  id?: AgnosticNonIndexRouteObject["id"];
  loader?: AgnosticNonIndexRouteObject["loader"];
  action?: AgnosticNonIndexRouteObject["action"];
  hasErrorBoundary?: AgnosticNonIndexRouteObject["hasErrorBoundary"];
  shouldRevalidate?: AgnosticNonIndexRouteObject["shouldRevalidate"];
  handle?: AgnosticNonIndexRouteObject["handle"];
  index?: false;
  children?: RouteObject[];
  element?: React.ReactNode | null;
  errorElement?: React.ReactNode | null;
}

export type RouteObject = IndexRouteObject | NonIndexRouteObject;

export type DataRouteObject = RouteObject & {
  children?: DataRouteObject[];
  id: string;
};

export interface RouteMatch<
  ParamKey extends string = string,
  RouteObjectType extends RouteObject = RouteObject
> extends AgnosticRouteMatch<ParamKey, RouteObjectType> {}

export interface DataRouteMatch extends RouteMatch<string, DataRouteObject> {}

// 数据静态路由器上下文
// Contexts for data routers
export const DataStaticRouterContext =
  React.createContext<StaticHandlerContext | null>(null); // 默认为null
if (__DEV__) {
  DataStaticRouterContext.displayName = "DataStaticRouterContext";
}

export interface DataRouterContextObject extends NavigationContextObject {
  router: Router;
}

// 数据路由器上下文
export const DataRouterContext =
  React.createContext<DataRouterContextObject | null>(null); // 默认为null
if (__DEV__) {
  DataRouterContext.displayName = "DataRouter";
}

// 数据路由器状态上下文
export const DataRouterStateContext = React.createContext<
  Router["state"] | null
>(null); // 默认为null
if (__DEV__) {
  DataRouterStateContext.displayName = "DataRouterState";
}

export const AwaitContext = React.createContext<TrackedPromise | null>(null);
if (__DEV__) {
  AwaitContext.displayName = "Await";
}

export type RelativeRoutingType = "route" | "path";

export interface NavigateOptions {
  replace?: boolean;
  state?: any;
  preventScrollReset?: boolean;
  relative?: RelativeRoutingType;
}

/**
 * A Navigator is a "location changer"; it's how you get to different locations.
 *
 * Every history instance conforms to the Navigator interface, but the
 * distinction is useful primarily when it comes to the low-level <Router> API
 * where both the location and a navigator must be provided separately in order
 * to avoid "tearing" that may occur in a suspense-enabled app if the action
 * and/or location were to be read directly from the history instance.
 */
export interface Navigator {
  createHref: History["createHref"];
  go: History["go"];
  push(to: To, state?: any, opts?: NavigateOptions): void;
  replace(to: To, state?: any, opts?: NavigateOptions): void;
}

interface NavigationContextObject {
  basename: string;
  navigator: Navigator;
  static: boolean;
}

// 导航上下文
export const NavigationContext = React.createContext<NavigationContextObject>(
  null! // 默认为null
);

if (__DEV__) {
  NavigationContext.displayName = "Navigation";
}

interface LocationContextObject {
  location: Location;
  navigationType: NavigationType;
}

// 位置上下文
export const LocationContext = React.createContext<LocationContextObject>(
  null! // 默认为null
);

if (__DEV__) {
  LocationContext.displayName = "Location";
}

export interface RouteContextObject {
  outlet: React.ReactElement | null;
  matches: RouteMatch[];
}

// +++
// 路由上下文
export const RouteContext = React.createContext<RouteContextObject>({
  outlet: null, // 出口属性
  matches: [], // 匹配属性
}); // 默认为这样一个对象 // +++

if (__DEV__) {
  RouteContext.displayName = "Route";
}

export const RouteErrorContext = React.createContext<any>(null);

if (__DEV__) {
  RouteErrorContext.displayName = "RouteError";
}

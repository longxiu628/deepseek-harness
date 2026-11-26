/**
 * Minimal ambient declarations for the three browser platform modules the Raw
 * JavaScript plugin consumes at runtime through `window.__ModuleLoader__`.
 *
 * `plugins/` is not a pnpm workspace package, so the real package types are not
 * resolvable from this directory. These declarations keep `checkJs` meaningful
 * for this plugin's own code — dictionary keys, component props, and store
 * action signatures — without pulling the whole client package graph into the
 * program. Update them with the plugin's actual platform usage.
 */

declare module 'react' {  export interface MutableRefObject<T> {
    current: T
  }

  export function createElement(
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown

  export function useEffect(
    effect: () => void | (() => void),
    dependencies?: readonly unknown[],
  ): void

  export function useMemo<T>(factory: () => T, dependencies: readonly unknown[]): T

  export function useRef<T>(initial: T): MutableRefObject<T>

  export function useState<T>(
    initial: T | (() => T),
  ): [T, (value: T | ((previous: T) => T)) => void]
}

declare module '@deepseek-ai/dsh-client-store' {
  export interface StoreInstance {
    readonly actions: Record<string, (...args: any[]) => void>
    getSnapshot(): any
  }

  export function defineStore<A extends Record<string, (...args: any[]) => void>>(spec: {
    init: () => any
    actions: A
  }): {
    create(scopeKey?: string): StoreInstance
  }
}

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  export interface CodeToolbarLabels {
    codeLabel: string
    wrapLabel: string
    unwrapLabel: string
  }

  export interface MarkdownLabels {
    code: {
      copyLabel: string
      copiedLabel: string
      toolbarLabels?: CodeToolbarLabels
    }
    footnotes: string
  }

  export interface MarkdownTextProps {
    text: string
    streaming?: boolean
    labels?: MarkdownLabels
    fileMentions?: unknown
    pathImages?: unknown
    omitHtml?: boolean
  }

  export function MarkdownText(props: MarkdownTextProps): unknown

  export function IconRefreshOutlineRegular(props: { size?: number }): unknown

  export const GuideArtworkFiles: unknown
}

interface Window {
  readonly __ModuleLoader__: {
    load(definition: {
      id: string
      meta(): unknown
      factory(require: (id: string) => any): unknown
    }): void
  }
}

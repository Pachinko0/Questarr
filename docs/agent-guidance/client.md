# Client Guidance

Apply this guidance to changes under `client/` and to shared code consumed by the React application.

## Architecture and Data Access

- `client/src/App.tsx` defines the application shell and lazy page routes.
- `client/src/lib/queryClient.ts` is the HTTP boundary. Use `apiFetch` or `apiRequest` so base-path
  handling, JWT headers, credentials, and API errors stay consistent. Do not add direct `fetch` calls
  for Questarr API requests.
- Use TanStack Query for server state. Keep query keys stable and invalidate every affected key after
  successful mutations.
- The default stale time is infinite, so missing invalidation can leave the UI permanently stale.
- Keep temporary form or display state local. Do not copy server state into component state unless
  there is a concrete editing or synchronization requirement.
- Centralize application paths in `client/src/lib/routes.ts` and base-path behavior in
  `client/src/lib/app-path.ts`.

## Components and UX

- Preserve the dark-first, cover-led visual identity and the existing Tailwind/Radix component
  system. Reuse components under `client/src/components/ui/` before creating a competing primitive.
- Do not edit generated-style UI primitives for a one-off page fix unless the behavior genuinely
  belongs to the shared primitive.
- Pages must remain usable in phone portrait layouts. Avoid desktop-only hover interactions,
  fixed-width dialogs, and controls that require precise pointer input.
- Keep primary actions reachable, touch targets forgiving, and dense metadata progressively
  disclosed on smaller screens.
- Preserve base-path deployments; do not assume the application is hosted at `/`.

## Accessibility

- Use semantic elements and native controls where possible.
- Every icon-only action needs an accessible name.
- Form labels must be associated with controls, and validation errors must be understandable without
  relying on color alone.
- Preserve keyboard operation and visible focus behavior in dialogs, menus, drawers, and tables.
- Radix primitives already provide many roles and ARIA attributes; avoid adding conflicting roles.

## Authentication and Real-Time Updates

- Authentication state is owned by `client/src/lib/auth.tsx`; do not create a second token store.
- API helpers attach the current local token. Handle 401/403 outcomes consistently with the existing
  logout and redirect behavior.
- Reuse the shared Socket.io client in `client/src/lib/socket.ts`; do not create a socket per
  component. Clean up event listeners on unmount.
- Socket events should trigger focused query invalidation rather than duplicate server state in the
  browser. Polling remains a fallback for download progress.

## React Conventions

- Use functional components and explicit prop types.
- Derive expensive or referentially sensitive values with `useMemo`; stabilize callbacks passed to
  memoized children or effect dependency arrays with `useCallback` when it prevents real churn.
- Avoid redundant effects and derived state. Never suppress hook dependency warnings without a
  documented reason.
- Keep lazy loading for page-level routes and heavy dialogs where the existing application does so.

## Testing and Verification

- Use Testing Library and test behavior from the user's perspective.
- Wrap components with the same providers they require in production. QueryClient test instances
  should define an appropriate query function or explicitly mock each active query.
- Await user interactions and asynchronous state changes to avoid React `act()` warnings.
- When mocking Radix primitives, preserve valid DOM nesting and accessible behavior.
- Add mobile regression coverage when changing responsive layout or navigation.

Run the relevant file under `client/__tests__/` or `client/src/**/__tests__/` first, then run
`npm run check`. Run the full suite for shared components, authentication, query infrastructure,
navigation, or broad UI changes.

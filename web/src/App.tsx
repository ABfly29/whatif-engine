import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";

// The calculator pulls in the chart library; keep it off the landing page.
const Workspace = lazy(() => import("./pages/Workspace"));

/** Remount when the link's query changes, so opening another shared link in the same tab loads it. */
function WorkspaceRoute() {
  const { search } = useLocation();
  return <Workspace key={search} />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route
          path="app"
          element={
            <Suspense fallback={<p className="container muted">Loading…</p>}>
              <WorkspaceRoute />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <div className="container not-found">
              <h1>Page not found</h1>
              <p className="muted">That page does not exist.</p>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}

import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";

// The calculator pulls in the chart library; keep it off the landing page.
const Workspace = lazy(() => import("./pages/Workspace"));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route
          path="app"
          element={
            <Suspense fallback={<p className="container muted">Loading…</p>}>
              <Workspace />
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

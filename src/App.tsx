import { lazy, Suspense, useEffect, useState } from "react";
import { StudioRuntime } from "@/studio/runtime";
import { StudioShell } from "@/shell/StudioShell";
import { DashboardPage } from "@/pages/dashboard-page";
import "@/studio.css";

const ImageStudioPage = lazy(() => import("@/pages/image-studio-page").then((module) => ({ default: module.ImageStudioPage })));
const VideoStudioPage = lazy(() => import("@/pages/video-studio-page").then((module) => ({ default: module.VideoStudioPage })));
const EcommerceSuitePage = lazy(() => import("@/pages/ecommerce-suite-page").then((module) => ({ default: module.EcommerceSuitePage })));
const StoryDirectorPage = lazy(() => import("@/pages/story-director-page").then((module) => ({ default: module.StoryDirectorPage })));
const LibraryPage = lazy(() => import("@/pages/library-page").then((module) => ({ default: module.LibraryPage })));
const FlowCanvasPage = lazy(() => import("@/pages/flow-canvas-page").then((module) => ({ default: module.FlowCanvasPage })));
const SettingsPage = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })));

function currentRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/canvas")) return "canvas";
  if (path === "/image") return "image";
  if (path === "/video") return "video";
  if (path === "/ecommerce") return "ecommerce";
  if (path === "/story") return "story";
  if (path === "/library") return "library";
  if (path === "/settings" || path === "/catalog" || path === "/wiring") return "settings";
  return "home";
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const update = () => setRoute(currentRoute());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  const page =
    route === "canvas" ? <FlowCanvasPage /> :
    route === "image" ? <ImageStudioPage /> :
    route === "video" ? <VideoStudioPage /> :
    route === "ecommerce" ? <EcommerceSuitePage /> :
    route === "story" ? <StoryDirectorPage /> :
    route === "library" ? <LibraryPage /> :
    route === "settings" ? <SettingsPage /> :
    <DashboardPage />;

  return (
    <StudioRuntime>
      <StudioShell>
        <Suspense fallback={<div className="studio-placeholder">载入中</div>}>{page}</Suspense>
      </StudioShell>
    </StudioRuntime>
  );
}

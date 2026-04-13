import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Shell from "@/components/layout/Shell";
import ProtectedRoute from "@/components/ProtectedRoute";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import TheBrain from "@/pages/TheBrain";
import ThreadCanvas from "@/pages/ThreadCanvas";
import ThreadCreation from "@/pages/ThreadCreation";
import ArtifactEditor from "@/pages/ArtifactEditor";
import KnowledgeBase from "@/pages/KnowledgeBase";
import KnowledgeBaseV2 from "@/pages/KnowledgeBaseV2";
import Recall from "@/pages/Recall";
import Profile from "@/pages/Profile";
import MyThreads from "@/pages/MyThreads";
import AdminSettings from "@/pages/AdminSettings";
import AgendaDropbox from "@/pages/AgendaDropbox";
import ProjectSettings from "@/pages/ProjectSettings";

function Router() {
  return (
    <Switch>
      {/* Public Pages */}
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      
      {/* Dashboard - App Routes (Protected) */}
      <Route path="/dashboard" component={() => <ProtectedRoute><Shell><TheBrain /></Shell></ProtectedRoute>} />
      <Route path="/threads" component={() => <ProtectedRoute><Shell><MyThreads /></Shell></ProtectedRoute>} />
      <Route path="/knowledge-base" component={() => <ProtectedRoute><Shell><KnowledgeBase /></Shell></ProtectedRoute>} />
      <Route
        path="/knowledge-base-2"
        component={() => (
          <ProtectedRoute>
            <Shell>
              <KnowledgeBaseV2 />
            </Shell>
          </ProtectedRoute>
        )}
      />
      <Route path="/search" component={() => <ProtectedRoute><Shell><Recall /></Shell></ProtectedRoute>} />
      <Route path="/agenda" component={() => <ProtectedRoute roles={["ADMIN", "PM"]}><Shell><AgendaDropbox /></Shell></ProtectedRoute>} />
      <Route path="/profile" component={() => <ProtectedRoute><Shell><Profile /></Shell></ProtectedRoute>} />
      
      {/* Admin-only routes */}
      <Route path="/admin/users" component={() => <ProtectedRoute roles={["ADMIN"]}><Shell><div className="p-8"><h1 className="text-2xl font-bold">User Management</h1><p className="text-muted-foreground mt-2">Admin user management coming soon.</p></div></Shell></ProtectedRoute>} />
      <Route path="/admin/settings" component={() => <ProtectedRoute roles={["ADMIN"]}><Shell><AdminSettings /></Shell></ProtectedRoute>} />
      
      {/* Thread Creation - No Shell (Full Screen, Protected, PM+Admin only) */}
      <Route path="/thread/new" component={() => <ProtectedRoute roles={["ADMIN", "PM"]}><ThreadCreation /></ProtectedRoute>} />
      
      {/* Thread/Project Settings (PM+Admin) */}
      <Route path="/thread/:id/settings" component={() => <ProtectedRoute roles={["ADMIN", "PM"]}><ProjectSettings /></ProtectedRoute>} />

      {/* Thread Detail View (Canvas) - No Shell (Full Screen, Protected) */}
      <Route path="/thread/:id" component={() => <ProtectedRoute><ThreadCanvas /></ProtectedRoute>} />
      
      {/* Editor View - No Shell (Focus Mode, Protected) */}
      <Route path="/editor" component={() => <ProtectedRoute><ArtifactEditor /></ProtectedRoute>} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

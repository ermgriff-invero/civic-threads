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
import Recall from "@/pages/Recall";
import Profile from "@/pages/Profile";
import MyThreads from "@/pages/MyThreads";

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
      <Route path="/search" component={() => <ProtectedRoute><Shell><Recall /></Shell></ProtectedRoute>} />
      <Route path="/profile" component={() => <ProtectedRoute><Shell><Profile /></Shell></ProtectedRoute>} />
      
      {/* Thread Creation - No Shell (Full Screen, Protected) */}
      <Route path="/thread/new" component={() => <ProtectedRoute><ThreadCreation /></ProtectedRoute>} />
      
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

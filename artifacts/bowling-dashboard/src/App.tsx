import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import Home from "@/pages/Home";
import ScoreComparison from "@/pages/ScoreComparison";
import TeamBuilder from "@/pages/TeamBuilder";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/score" component={ScoreComparison} />
          <Route path="/team" component={TeamBuilder} />
        </Switch>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, FileText, CheckCircle2, MoreHorizontal, Archive, Zap } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Background Network Animation Component
const NetworkBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      <svg className="w-full h-full opacity-[0.03]" width="100%" height="100%">
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="currentColor" />
        </pattern>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
};

export default function Recall() {
  const [searchQuery, setSearchQuery] = useState("");
  const closedThreads = [
    { 
      id: 1, 
      title: "Downtown Revitalization Initiative 2023", 
      date: "Decided 3 months ago", 
      author: "Planning Dept", 
      type: "Resolution", 
      outcome: "Approved",
      context: "Phase 1 funding approved - $2.5M allocated",
      duration: "45 days"
    },
    { 
      id: 2, 
      title: "Noise Ordinance Amendment", 
      date: "Decided 2 months ago", 
      author: "Public Safety", 
      type: "Ordinance", 
      outcome: "Approved",
      context: "Revised operating hours: 6 AM - 10 PM weekdays",
      duration: "28 days"
    },
    { 
      id: 3, 
      title: "2024 Budget Allocation", 
      date: "Decided 1 month ago", 
      author: "Finance", 
      type: "Budget", 
      outcome: "Approved",
      context: "Total budget: $145M across 8 departments",
      duration: "62 days"
    },
    { 
      id: 4, 
      title: "Park Renovation Proposal", 
      date: "Decided 4 weeks ago", 
      author: "Parks & Rec", 
      type: "Resolution", 
      outcome: "Approved",
      context: "Renovation scheduled for Q2 2025",
      duration: "35 days"
    },
    { 
      id: 5, 
      title: "Historic District Zoning Review", 
      date: "Decided 6 weeks ago", 
      author: "Planning Dept", 
      type: "Resolution", 
      outcome: "Denied",
      context: "Concerns about architectural compliance - revisit in 2025",
      duration: "41 days"
    },
    { 
      id: 6, 
      title: "Community Center Expansion", 
      date: "Decided 3 months ago", 
      author: "Community Services", 
      type: "Resolution", 
      outcome: "Approved",
      context: "Approved with conditions - phase-based approach",
      duration: "52 days"
    },
  ];

  const stats = {
    total: closedThreads.length,
    approved: closedThreads.filter(t => t.outcome === "Approved").length,
    denied: closedThreads.filter(t => t.outcome === "Denied").length,
  };

  const filteredThreads = closedThreads.filter(thread => 
    thread.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    thread.context.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative min-h-full p-4 md:p-8 space-y-8 pb-24">
      <NetworkBackground />

      {/* Header Section */}
      <section className="space-y-6 pt-8 md:pt-12 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-2">
            <Archive className="w-6 h-6 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
              Recall
            </h1>
          </div>
          <p className="text-xl text-muted-foreground font-light">
            Institutional memory of closed threads and final decisions. Search the archive to learn from past governance outcomes.
          </p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Total Closed", value: stats.total, color: "text-[#FB4F14]" },
            { label: "Approved", value: stats.approved, color: "text-[#FB4F14]" },
            { label: "Denied", value: stats.denied, color: "text-[#8C2F2F]" },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="bg-background/60 backdrop-blur-sm">
                <CardContent className="pt-6">
                  <p className={cn("text-sm font-medium mb-1", stat.color)}>{stat.label}</p>
                  <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Search Bar */}
      <div className="max-w-6xl relative">
        <div className="flex items-center bg-background/80 backdrop-blur-xl border border-primary/20 shadow-lg rounded-full px-6 py-3 focus-within:ring-2 focus-within:ring-primary/20 focus-within:shadow-xl">
          <FileText className="w-5 h-5 text-primary mr-3" />
          <input 
            type="text" 
            placeholder="Search closed threads and decisions..."
            className="flex-1 bg-transparent border-none outline-none text-base placeholder:text-muted-foreground/50 text-foreground"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button size="sm" className="rounded-full px-4 ml-2 hidden md:flex">
            Search
          </Button>
        </div>
      </div>

      {/* Closed Threads Section */}
      <section className="max-w-6xl space-y-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Closed & Decided
          </h2>
          <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-primary/5">
            View Timeline
          </Button>
        </div>

        <div className="grid gap-4">
          {filteredThreads.map((thread, index) => (
            <Link key={thread.id} href={`/thread/${thread.id}`}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + (index * 0.05) }}
              >
                <Card className="hover:shadow-lg transition-all duration-300 hover:border-primary/50 cursor-pointer group bg-background/60 backdrop-blur-sm">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      {/* Header Row */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-lg leading-tight text-foreground group-hover:text-primary transition-colors">
                            {thread.title}
                          </h3>
                        </div>
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </div>

                      {/* Metadata */}
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge variant="outline" className={cn(
                          "border-0",
                          thread.outcome === "Approved" 
                            ? "bg-[#FB4F14]/15 text-[#C43D0A] dark:bg-[#FB4F14]/20 dark:text-[#FFA07A]"
                            : "bg-[#8C2F2F]/15 text-[#5a1f1f] dark:bg-[#8C2F2F]/20 dark:text-[#d68a8a]"
                        )}>
                          {thread.outcome}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{thread.type}</span>
                        <span className="text-sm text-muted-foreground">•</span>
                        <span className="text-sm text-muted-foreground">{thread.author}</span>
                      </div>

                      {/* Context */}
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {thread.context}
                      </p>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-muted-foreground">{thread.date}</span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Zap className="w-3 h-3" />
                          {thread.duration} review period
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          ))}
        </div>
      </section>

      {/* Info Box */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="max-w-6xl"
      >
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Archive className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-foreground">Institutional Memory</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  The Recall section preserves the complete history of municipal decisions. Use this archive to understand precedents, learn from past decisions, and ensure consistency in future governance. All closed threads include their outcomes and decision rationale.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

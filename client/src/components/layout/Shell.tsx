import { Link, useLocation } from "wouter";
import { 
  Network, 
  GitBranch, 
  Search, 
  User, 
  Plus, 
  Menu,
  Bell,
  Settings,
  Library,
  LogOut,
  ClipboardCheck,
  Inbox
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";

export default function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isLoading, logout } = useAuth();

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || 'U';
  };

  const getDisplayName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user?.firstName) return user.firstName;
    if (user?.email) return user.email.split('@')[0];
    return 'User';
  };

  const navItems = [
    { icon: Network, label: "Dashboard", href: "/dashboard" },
    { icon: GitBranch, label: "Threads", href: "/threads" },
    { icon: Library, label: "Knowledge", href: "/knowledge-base" },
    { icon: ClipboardCheck, label: "Permitting", href: "#", comingSoon: true },
    { icon: Inbox, label: "Agenda Dropbox", href: "#", comingSoon: true },
    { icon: Search, label: "Recall", href: "/search" },
    { icon: User, label: "Profile", href: "/profile" },
  ];

  return (
    <div className="min-h-screen bg-muted/30 font-sans text-foreground flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-background/50 backdrop-blur-xl h-screen sticky top-0 z-50">
        <div className="p-6 flex items-center gap-2 border-b border-[#002244]/10">
          <div className="w-8 h-8 rounded-lg bg-[#002244] flex items-center justify-center text-white">
            <Network className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg tracking-tight text-[#002244]">Civic Threads</span>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => (
            item.comingSoon ? (
              <div 
                key={item.label}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground/50 cursor-not-allowed"
              >
                <item.icon className="w-5 h-5" />
                {item.label}
                <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 h-4">Soon</Badge>
              </div>
            ) : (
              <Link key={item.href} href={item.href} className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                  location === item.href 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}>
                  <item.icon className="w-5 h-5" />
                  {item.label}
              </Link>
            )
          ))}
        </nav>

        <div className="p-4 border-t space-y-4">
           <div className="bg-gradient-to-br from-[#002244]/10 to-[#002244]/5 p-4 rounded-xl border border-[#002244]/20">
              <p className="text-xs font-semibold text-[#002244] mb-1">Active Council</p>
              <p className="text-xs text-muted-foreground">Next meeting in 2 days</p>
           </div>
           
           <div className="flex items-center gap-3 px-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback>{getInitials(user?.firstName, user?.lastName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate" data-testid="text-user-name">{getDisplayName()}</p>
                {user?.title || user?.municipality ? (
                  <p className="text-xs text-muted-foreground truncate" data-testid="text-user-role">
                    {[user?.title, user?.municipality].filter(Boolean).join(' • ')}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground truncate">{user?.email || 'No email'}</p>
                )}
              </div>
              <button 
                onClick={() => logout()}
                className="p-1 hover:bg-muted rounded transition-colors"
                title="Sign out"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
              </button>
           </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur-md border-b sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#002244] flex items-center justify-center text-white">
            <Network className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg text-[#002244]">Civic Threads</span>
        </div>
        <div className="flex items-center gap-2">
           <Bell className="w-5 h-5 text-muted-foreground" />
           <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <div className="flex items-center gap-3 mt-4 pb-4 border-b">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback>{getInitials(user?.firstName, user?.lastName)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium">{getDisplayName()}</p>
                  {user?.title || user?.municipality ? (
                    <p className="text-xs text-muted-foreground">
                      {[user?.title, user?.municipality].filter(Boolean).join(' • ')}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{user?.email || 'No email'}</p>
                  )}
                </div>
              </div>
              <nav className="flex flex-col gap-4 mt-4">
                 {navItems.map((item) => (
                  item.comingSoon ? (
                    <div 
                      key={item.label}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg text-lg font-medium text-muted-foreground/50 cursor-not-allowed"
                    >
                      <item.icon className="w-5 h-5" />
                      {item.label}
                      <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 h-4">Soon</Badge>
                    </div>
                  ) : (
                    <Link key={item.href} href={item.href} className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-lg text-lg font-medium transition-colors",
                        location === item.href 
                          ? "bg-primary/10 text-primary" 
                          : "text-muted-foreground hover:bg-muted"
                      )}>
                        <item.icon className="w-5 h-5" />
                        {item.label}
                    </Link>
                  )
                ))}
                <button
                  onClick={() => logout()}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-lg font-medium text-muted-foreground hover:bg-muted transition-colors"
                  data-testid="button-mobile-logout"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              </nav>
            </SheetContent>
           </Sheet>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t z-50 pb-safe">
        <div className="flex justify-around items-center h-16 px-2">
          {navItems.filter(item => !item.comingSoon).map((item) => (
            <Link key={item.href} href={item.href} className={cn(
                "flex flex-col items-center justify-center w-full h-full gap-1",
                location === item.href 
                  ? "text-primary" 
                  : "text-muted-foreground"
              )}>
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* FAB - Global New Thread Button */}
      <div className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-50">
        <Link href="/thread/new">
          <Button 
            size="lg" 
            className="rounded-full h-14 w-14 md:h-auto md:w-auto md:px-6 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all hover:scale-105 bg-primary text-primary-foreground"
          >
            <Plus className="w-6 h-6 md:mr-2" />
            <span className="hidden md:inline font-semibold">Start New Thread</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Link } from "wouter";
import {
  Network,
  GitBranch,
  Sparkles,
  BookOpen,
  Users,
  ArrowRight,
  Check,
  FileText,
  Zap,
  Shield,
  ChevronRight,
  Quote,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Clean gradient background for hero section (replaced overlapping animations)
const HeroVisualization = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Subtle gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-primary/8 rounded-full blur-2xl" />
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #002244 1px, transparent 1px),
            linear-gradient(to bottom, #002244 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px'
        }}
      />
    </div>
  );
};

// Header component with scroll effect
const LandingHeader = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled
          ? "bg-background/80 backdrop-blur-xl border-b shadow-sm"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
              <Network className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight">Civic Threads</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-features">
              Features
            </a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-how-it-works">
              How it Works
            </a>
            <a href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-testimonials">
              Testimonials
            </a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-pricing">
              Pricing
            </a>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" data-testid="button-login">Login</Button>
            </Link>
            <Link href="/signup">
              <Button data-testid="button-get-started-header">Get Started</Button>
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="button-mobile-menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden py-4 border-t bg-background"
          >
            <nav className="flex flex-col gap-4">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(false)}>
                Features
              </a>
              <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(false)}>
                How it Works
              </a>
              <a href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(false)}>
                Testimonials
              </a>
              <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(false)}>
                Pricing
              </a>
              <div className="flex gap-2 pt-4 border-t">
                <Link href="/login" className="flex-1">
                  <Button variant="outline" className="w-full">Login</Button>
                </Link>
                <Link href="/signup" className="flex-1">
                  <Button className="w-full">Get Started</Button>
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </div>
    </header>
  );
};

// Feature card component
const FeatureCard = ({
  icon: Icon,
  title,
  description,
  delay,
}: {
  icon: any;
  title: string;
  description: string;
  delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-100px" }}
    transition={{ duration: 0.5, delay }}
  >
    <Card className="h-full bg-background/60 backdrop-blur-sm border-border/50 hover:border-primary/30 hover:shadow-lg transition-all duration-300 group">
      <CardContent className="p-6">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
          <Icon className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  </motion.div>
);

// Testimonial card
const TestimonialCard = ({
  quote,
  author,
  role,
  city,
  delay,
}: {
  quote: string;
  author: string;
  role: string;
  city: string;
  delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay }}
  >
    <Card className="h-full bg-background/60 backdrop-blur-sm border-border/50">
      <CardContent className="p-6">
        <Quote className="w-8 h-8 text-primary/30 mb-4" />
        <p className="text-foreground/80 mb-4 italic">"{quote}"</p>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
            {author.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-sm">{author}</p>
            <p className="text-xs text-muted-foreground">{role}, {city}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

// Main Landing component
export default function Landing() {
  const [email, setEmail] = useState("");

  const features = [
    {
      icon: GitBranch,
      title: "Thread Canvas",
      description: "Visual workflow builder that maps complex municipal decisions into clear, actionable threads.",
    },
    {
      icon: Sparkles,
      title: "AI Steward",
      description: "Intelligent assistant that provides context, suggests precedents, and helps draft documents.",
    },
    {
      icon: BookOpen,
      title: "Knowledge Base",
      description: "Institutional memory that preserves decisions, rationale, and outcomes for future reference.",
    },
    {
      icon: Users,
      title: "Real-time Collaboration",
      description: "Work together seamlessly with your team, stakeholders, and community members.",
    },
  ];

  const steps = [
    {
      icon: FileText,
      title: "Create Thread",
      description: "Start a new decision thread for any municipal matter—from zoning to budgets.",
    },
    {
      icon: GitBranch,
      title: "Add Nodes",
      description: "Build your workflow with connected nodes representing documents, reviews, and milestones.",
    },
    {
      icon: Sparkles,
      title: "AI Assists",
      description: "Let our AI Steward surface relevant precedents, draft documents, and identify risks.",
    },
    {
      icon: Check,
      title: "Decision Made",
      description: "Reach informed decisions with full context, transparency, and documented rationale.",
    },
  ];

  const testimonials = [
    {
      quote: "Civic Threads transformed how we track and document our council decisions. The AI insights alone have saved us countless hours of research.",
      author: "Maria Santos",
      role: "City Clerk",
      city: "Riverside, CA",
    },
    {
      quote: "Finally, a system that understands the complexity of municipal governance. Our institutional knowledge is no longer lost when staff retire.",
      author: "James Mitchell",
      role: "City Manager",
      city: "Boulder, CO",
    },
    {
      quote: "The visual thread canvas makes it easy to explain complex decisions to constituents. Transparency has never been this accessible.",
      author: "Sarah Chen",
      role: "Council Member",
      city: "Austin, TX",
    },
  ];

  return (
    <div className="min-h-screen bg-background scroll-smooth">
      <LandingHeader />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-background via-background to-muted/30 pt-16">
        <HeroVisualization />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20"
            >
              <Sparkles className="w-4 h-4" />
              <span>AI-Powered Municipal Intelligence</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight"
            >
              The System of Record for{" "}
              <span className="text-primary">Municipal Decisions</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto"
            >
              Transform how your government tracks, documents, and decides. 
              Civic Threads brings operational intelligence to municipal governance 
              with visual workflows, AI assistance, and institutional memory.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
            >
              <Link href="/signup">
                <Button size="lg" className="text-lg px-8 h-12 shadow-lg shadow-primary/20" data-testid="button-get-started">
                  Get Started
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Everything You Need for{" "}
              <span className="text-primary">Modern Governance</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Purpose-built tools for municipal decision-making, designed with input from city managers, 
              clerks, and council members.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                delay={index * 0.1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              How <span className="text-primary">Civic Threads</span> Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From initial idea to documented decision in four simple steps.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className="relative"
              >
                {/* Connection line */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-primary/50 to-transparent" />
                )}
                
                <div className="text-center">
                  <div className="relative inline-flex">
                    <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                      <step.icon className="w-10 h-10 text-primary" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      {index + 1}
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Trusted by <span className="text-primary">Municipal Leaders</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              See what city officials across the country are saying about Civic Threads.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {testimonials.map((testimonial, index) => (
              <TestimonialCard
                key={testimonial.author}
                quote={testimonial.quote}
                author={testimonial.author}
                role={testimonial.role}
                city={testimonial.city}
                delay={index * 0.1}
              />
            ))}
          </div>

          {/* Placeholder logos */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="flex flex-wrap items-center justify-center gap-8 md:gap-12 opacity-50"
          >
            {["Riverside", "Boulder", "Austin", "Portland", "Denver", "Seattle"].map((city) => (
              <div key={city} className="flex items-center gap-2 text-muted-foreground">
                <Shield className="w-5 h-5" />
                <span className="font-medium">{city}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section id="pricing" className="py-24 bg-gradient-to-b from-muted/30 to-primary/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold">
              Ready to Transform Your{" "}
              <span className="text-primary">Municipal Operations?</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Join forward-thinking municipalities using Civic Threads to make 
              better decisions, faster.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="Enter your work email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 text-base"
                data-testid="input-email"
              />
              <Button size="lg" className="w-full sm:w-auto h-12 px-8" data-testid="button-get-started-cta">
                Get Started
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              Questions?{" "}
              <a href="mailto:hello@civicthreads.com" className="text-primary hover:underline font-medium" data-testid="link-contact">
                Contact our team
              </a>{" "}
              for assistance.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background border-t py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            {/* Logo & Description */}
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
                  <Network className="w-5 h-5" />
                </div>
                <span className="font-bold text-xl tracking-tight">Civic Threads</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                The operational intelligence platform for modern municipal governance.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-foreground transition-colors">How it Works</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Integrations</a></li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Case Studies</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Support</a></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Privacy</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Civic Threads. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

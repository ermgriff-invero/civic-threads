import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, Link as LinkIcon, CheckCircle, ChevronDown, Compass, Search, MessageSquare, FileText, Settings, BarChart3, TrendingUp, Scale, Bookmark, BookOpen, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface ThreadFormData {
  title: string;
  type: string;
  topic: string;
  description: string;
  author: string;
}

const PRIMARY_TYPES = [
  { value: 'Ordinance', label: 'Ordinance', description: 'Local law or regulation', icon: FileText },
  { value: 'Resolution', label: 'Resolution', description: 'Formal decision or action', icon: CheckCircle },
  { value: 'Staff Report', label: 'Staff Report', description: 'Official recommendation to council/board', icon: ClipboardList },
  { value: 'Policy Concept', label: 'Policy Concept', description: 'Early-stage idea under consideration', icon: Compass },
];

const MORE_TYPES = [
  { category: 'Pre-Legislative', items: [
    { value: 'Research Memo', label: 'Research Memo', description: 'Background research, peer city analysis', icon: Search },
    { value: 'Public Input Summary', label: 'Public Input Summary', description: 'Community feedback and surveys', icon: MessageSquare },
  ]},
  { category: 'Legislative', items: [
    { value: 'Amendment', label: 'Amendment', description: 'Modification to existing law', icon: FileText },
    { value: 'Report', label: 'Report', description: 'Analysis or findings', icon: BarChart3 },
  ]},
  { category: 'Execution & Operations', items: [
    { value: 'Implementation Plan', label: 'Implementation Plan', description: 'How policy will be executed', icon: Settings },
    { value: 'Impact Assessment', label: 'Impact Assessment', description: 'Fiscal, equity, or environmental impacts', icon: TrendingUp },
    { value: 'Performance Review', label: 'Performance Review', description: 'Post-implementation results', icon: BarChart3 },
  ]},
  { category: 'Legal & Compliance', items: [
    { value: 'Legal Opinion', label: 'Legal Opinion', description: 'Counsel interpretation or risk assessment', icon: Scale },
    { value: 'Administrative Rule', label: 'Administrative Rule', description: 'Internal policy not passed by council', icon: Bookmark },
  ]},
  { category: 'Process', items: [
    { value: 'Decision Log', label: 'Decision Log', description: 'Record of key decisions and rationale', icon: BookOpen },
    { value: 'Meeting Brief', label: 'Meeting Brief', description: 'Agenda context and summaries', icon: Calendar },
  ]},
];

export default function ThreadCreation() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showMoreTypes, setShowMoreTypes] = useState(false);
  const [formData, setFormData] = useState<ThreadFormData>({
    title: '',
    type: '',
    topic: '',
    description: '',
    author: 'Current User',
  });

  const createMutation = useMutation({
    mutationFn: async (data: ThreadFormData) => {
      const res = await apiRequest('POST', '/api/threads', {
        title: data.title,
        type: data.type,
        topic: data.topic,
        description: data.description,
        author: data.author,
        status: 'Drafting',
      });
      return res.json();
    },
    onSuccess: (newThread) => {
      queryClient.invalidateQueries({ queryKey: ['/api/threads'] });
      setLocation(`/thread/${newThread.id}`);
    },
  });

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleCreate = () => {
    if (formData.title && formData.type && formData.topic) {
      createMutation.mutate(formData);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.title.length > 0;
      case 2:
        return formData.type.length > 0;
      case 3:
        return formData.topic.length > 0 && formData.description.length > 0;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <Link href="/dashboard">
            <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </Link>
          <h1 className="text-4xl font-bold tracking-tight mb-2">Create New Thread</h1>
          <p className="text-lg text-muted-foreground">Let's build the foundation for your civic narrative</p>
        </motion.div>

        {/* Progress Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="mb-8 flex gap-3"
        >
          {[1, 2, 3].map((stepNum) => (
            <div key={stepNum} className="flex items-center gap-3">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all',
                  step === stepNum
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary/40'
                    : step > stepNum
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground border-2 border-primary'
                )}
              >
                {step > stepNum ? <CheckCircle2 className="w-5 h-5" /> : stepNum}
              </div>
              {stepNum < 3 && (
                <div
                  className={cn(
                    'h-1 w-8 transition-all',
                    step > stepNum 
                      ? 'bg-primary' 
                      : 'border-t-2 border-primary'
                  )}
                  style={step < stepNum ? {
                    borderStyle: 'dotted',
                    background: 'transparent'
                  } : {}}
                />
              )}
            </div>
          ))}
        </motion.div>

        {/* Form Card */}
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border-primary/20 shadow-lg">
            <CardHeader className="border-b border-border">
              {step === 1 && <CardTitle>What's the title of your thread?</CardTitle>}
              {step === 2 && <CardTitle>What type of document is this?</CardTitle>}
              {step === 3 && <CardTitle>Describe the topic and context</CardTitle>}
            </CardHeader>

            <CardContent className="pt-6">
              {/* Step 1: Title */}
              {step === 1 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Thread Title</label>
                    <input
                      type="text"
                      placeholder="e.g., Downtown Zoning Amendment"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Give your thread a clear, descriptive title that summarizes the main topic.
                  </p>
                </div>
              )}

              {/* Step 2: Type Selection */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {PRIMARY_TYPES.map((threadType) => {
                      const Icon = threadType.icon;
                      return (
                        <motion.button
                          key={threadType.value}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setFormData({ ...formData, type: threadType.value })}
                          className={cn(
                            'p-4 rounded-lg border-2 transition-all text-left flex items-start gap-3 h-24',
                            formData.type === threadType.value
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50 bg-background'
                          )}
                        >
                          <div className={cn(
                            'p-2 rounded-lg flex-shrink-0',
                            formData.type === threadType.value ? 'bg-primary/20' : 'bg-muted'
                          )}>
                            <Icon className={cn(
                              'w-4 h-4',
                              formData.type === threadType.value ? 'text-primary' : 'text-muted-foreground'
                            )} />
                          </div>
                          <div>
                            <div className="font-semibold">{threadType.label}</div>
                            <div className="text-sm text-muted-foreground mt-1">{threadType.description}</div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setShowMoreTypes(!showMoreTypes)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-2"
                  >
                    <ChevronDown className={cn('w-4 h-4 transition-transform', showMoreTypes && 'rotate-180')} />
                    {showMoreTypes ? 'Show fewer options' : 'More document types'}
                  </button>

                  <AnimatePresence>
                    {showMoreTypes && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden"
                      >
                        {MORE_TYPES.map((category) => (
                          <div key={category.category} className="space-y-2">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{category.category}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {category.items.map((item) => {
                                const Icon = item.icon;
                                return (
                                  <motion.button
                                    key={item.value}
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                    onClick={() => setFormData({ ...formData, type: item.value })}
                                    className={cn(
                                      'p-3 rounded-lg border transition-all text-left flex items-start gap-2',
                                      formData.type === item.value
                                        ? 'border-primary bg-primary/10'
                                        : 'border-border hover:border-primary/50 bg-background'
                                    )}
                                  >
                                    <Icon className={cn(
                                      'w-4 h-4 mt-0.5 flex-shrink-0',
                                      formData.type === item.value ? 'text-primary' : 'text-muted-foreground'
                                    )} />
                                    <div>
                                      <div className="font-medium text-sm">{item.label}</div>
                                      <div className="text-xs text-muted-foreground">{item.description}</div>
                                    </div>
                                  </motion.button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Step 3: Details */}
              {step === 3 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Topic Area</label>
                    <input
                      type="text"
                      placeholder="e.g., Zoning, Budget, Parks, Public Safety"
                      value={formData.topic}
                      onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      What area of governance does this relate to?
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description</label>
                    <textarea
                      placeholder="Describe the context, background, or key points of this thread..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={5}
                      className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      This helps provide context as you build out your thread.
                    </p>
                  </div>
                </div>
              )}

              {/* Summary Preview */}
              {step === 3 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-8 p-4 rounded-lg bg-primary/5 border border-primary/20"
                >
                  <div className="text-sm space-y-3">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Title</div>
                      <div className="font-semibold text-foreground mt-1">{formData.title}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Type</div>
                      <div className="mt-1">
                        <Badge className="bg-primary/20 text-primary border-primary/30">{formData.type}</Badge>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Topic</div>
                      <div className="font-semibold text-foreground mt-1">{formData.topic}</div>
                    </div>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Navigation Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="mt-8 flex gap-3 justify-between"
        >
          <Button
            onClick={handleBack}
            variant="outline"
            disabled={step === 1}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          {step < 3 ? (
            <Button
              onClick={handleNext}
              disabled={!isStepValid()}
              className="gap-2"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={!isStepValid()}
              className="gap-2 bg-[#FB4F14] hover:bg-[#C43D0A]"
            >
              <CheckCircle2 className="w-4 h-4" />
              Create Thread
            </Button>
          )}
        </motion.div>

        {/* Info Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {[
            { Icon: ClipboardList, title: 'Build Rich Narratives', description: 'Connect research, drafts, and decisions in one place' },
            { Icon: LinkIcon, title: 'Link Research', description: 'Reference precedents and supporting documents' },
            { Icon: CheckCircle, title: 'Track Decisions', description: 'Document outcomes and rationale for transparency' },
          ].map((card, idx) => (
            <div key={idx} className="p-4 rounded-lg bg-background/60 border border-border/50 hover:border-primary/30 transition-colors">
              <card.Icon className="w-8 h-8 mb-2 text-primary" />
              <div className="font-semibold text-sm mb-1">{card.title}</div>
              <div className="text-xs text-muted-foreground">{card.description}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

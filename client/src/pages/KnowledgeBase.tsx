import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Upload, 
  FileText, 
  Link as LinkIcon, 
  Trash2, 
  Tag, 
  Search,
  File,
  Globe,
  Zap,
  X,
  Loader2,
  Bot,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Headphones,
  Video,
  FileType,
  Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Document {
  id: number;
  title: string;
  type: string;
  category: string;
  content: string | null;
  description: string | null;
  dateAdded: string;
  indexed: boolean | null;
  processingStatus: string | null;
  extractedContent: string | null;
  filePath: string | null;
  mediaType: string | null;
  fileSize: number | null;
  duration: number | null;
}

interface KnowledgeLink {
  id: number;
  title: string;
  url: string;
  domain: string;
  description: string | null;
  tags: string[] | null;
  dateAdded: string;
}

export default function KnowledgeBase() {
  const [activeTab, setActiveTab] = useState("documents");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showAiIngestDialog, setShowAiIngestDialog] = useState(false);
  const [aiIngestUrl, setAiIngestUrl] = useState("");
  const [aiIngestTitle, setAiIngestTitle] = useState("");
  const [isAiIngesting, setIsAiIngesting] = useState(false);
  const [aiIngestedContent, setAiIngestedContent] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [viewDocId, setViewDocId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const [docForm, setDocForm] = useState({
    title: "",
    type: "pdf",
    category: "general",
    content: "",
    description: "",
  });

  const [linkForm, setLinkForm] = useState({
    title: "",
    url: "",
    description: "",
    tags: "",
  });

  const { data: apiDocuments = [] } = useQuery<Document[]>({
    queryKey: ['/api/documents'],
    refetchInterval: (data) => {
      const hasProcessing = data?.state?.data?.some(d => d.processingStatus === 'processing');
      return hasProcessing ? 3000 : false;
    },
  });

  const { data: apiLinks = [] } = useQuery<KnowledgeLink[]>({
    queryKey: ['/api/knowledge-links'],
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (data: typeof docForm) => {
      const res = await apiRequest('POST', '/api/documents', {
        title: data.title,
        type: data.type,
        category: data.category,
        content: data.content || null,
        description: data.description || null,
        indexed: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setShowUploadDialog(false);
      setDocForm({ title: "", type: "pdf", category: "general", content: "", description: "" });
    },
  });

  const createLinkMutation = useMutation({
    mutationFn: async (data: typeof linkForm) => {
      const url = new URL(data.url);
      const res = await apiRequest('POST', '/api/knowledge-links', {
        title: data.title,
        url: data.url,
        domain: url.hostname,
        description: data.description || null,
        tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge-links'] });
      setShowLinkDialog(false);
      setLinkForm({ title: "", url: "", description: "", tags: "" });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/knowledge-links/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge-links'] });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, title, category, description }: { file: File; title: string; category: string; description: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      formData.append('category', category);
      formData.append('description', description);
      
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(data.error || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setShowUploadDialog(false);
      setSelectedFile(null);
      setDocForm({ title: "", type: "pdf", category: "general", content: "", description: "" });
    },
    onError: (error: Error) => {
      alert(error.message || 'Failed to upload document');
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/documents/${id}/reprocess`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
  });

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "N/A";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const documents = apiDocuments.map(doc => ({
    id: doc.id,
    name: doc.title,
    type: doc.type,
    size: formatFileSize(doc.fileSize),
    date: new Date(doc.dateAdded).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    tags: [doc.category.toLowerCase()],
    relevance: doc.indexed ? "High" : "Medium",
    description: doc.description,
    processingStatus: doc.processingStatus,
    extractedContent: doc.extractedContent,
    mediaType: doc.mediaType,
    hasFile: !!doc.filePath,
  }));

  const links = apiLinks.map(link => ({
    id: link.id,
    title: link.title,
    url: link.url,
    date: new Date(link.dateAdded).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    tags: link.tags || [],
    domain: link.domain,
    description: link.description,
  }));

  const filteredDocuments = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    doc.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (doc.description && doc.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredLinks = links.filter(link => 
    link.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    link.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (link.description && link.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    
    const file = files[0];
    const fileName = file.name;
    const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
    
    let fileType = 'other';
    if (fileExt === 'pdf') fileType = 'pdf';
    else if (['doc', 'docx'].includes(fileExt)) fileType = 'word';
    else if (['xls', 'xlsx'].includes(fileExt)) fileType = 'excel';
    else if (['txt', 'md'].includes(fileExt)) fileType = 'text';
    else if (['mp3', 'wav', 'm4a', 'ogg', 'webm'].includes(fileExt)) fileType = 'audio';
    else if (['mp4', 'webm', 'mov', 'avi'].includes(fileExt)) fileType = 'video';
    
    setSelectedFile(file);
    setDocForm({
      ...docForm,
      title: fileName.replace(/\.[^/.]+$/, ''),
      type: fileType,
    });
    setShowUploadDialog(true);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const fileName = file.name;
    const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
    
    let fileType = 'other';
    if (fileExt === 'pdf') fileType = 'pdf';
    else if (['doc', 'docx'].includes(fileExt)) fileType = 'word';
    else if (['xls', 'xlsx'].includes(fileExt)) fileType = 'excel';
    else if (['txt', 'md'].includes(fileExt)) fileType = 'text';
    else if (['mp3', 'wav', 'm4a', 'ogg', 'webm'].includes(fileExt)) fileType = 'audio';
    else if (['mp4', 'webm', 'mov', 'avi'].includes(fileExt)) fileType = 'video';
    
    setSelectedFile(file);
    setDocForm({
      ...docForm,
      title: fileName.replace(/\.[^/.]+$/, ''),
      type: fileType,
    });
  };

  const handleDocSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.title.trim()) return;
    
    if (selectedFile) {
      uploadFileMutation.mutate({
        file: selectedFile,
        title: docForm.title,
        category: docForm.category,
        description: docForm.description,
      });
    } else if (docForm.content) {
      createDocumentMutation.mutate(docForm);
    }
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkForm.title.trim() || !linkForm.url.trim()) return;
    try {
      new URL(linkForm.url);
      createLinkMutation.mutate(linkForm);
    } catch {
      alert('Please enter a valid URL');
    }
  };

  const handleAiIngestUrl = async () => {
    if (!aiIngestUrl.trim()) return;
    
    try {
      new URL(aiIngestUrl);
    } catch {
      alert('Please enter a valid URL');
      return;
    }
    
    setIsAiIngesting(true);
    setAiIngestedContent("");
    
    try {
      const response = await fetch('/api/ai/ingest-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: aiIngestUrl }),
      });

      if (!response.ok) throw new Error('Failed to ingest URL');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let content = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  content += data.content;
                  setAiIngestedContent(content);
                }
                if (data.title && !aiIngestTitle) {
                  setAiIngestTitle(data.title);
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (error) {
      alert('Failed to fetch and process URL content. Please try again.');
    } finally {
      setIsAiIngesting(false);
    }
  };

  const handleSaveIngestedContent = () => {
    if (!aiIngestTitle.trim() || !aiIngestedContent.trim()) return;
    
    createDocumentMutation.mutate({
      title: aiIngestTitle,
      type: "other",
      category: "general",
      content: aiIngestedContent,
      description: `AI-ingested content from: ${aiIngestUrl}`,
    }, {
      onSuccess: () => {
        setShowAiIngestDialog(false);
        setAiIngestUrl("");
        setAiIngestTitle("");
        setAiIngestedContent("");
      }
    });
  };

  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-8 space-y-8 pb-24">
      {/* Header */}
      <section className="space-y-2">
        <h1 className="text-4xl font-bold text-foreground">Knowledge Base</h1>
        <p className="text-muted-foreground">Your municipality's custom document and reference library. The AI uses this to provide contextualized answers.</p>
      </section>

      {/* Upload Area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="border-2 border-dashed hover:border-primary/50 transition-colors group">
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-foreground">Upload Documents or Add Links</h3>
                <p className="text-sm text-muted-foreground mt-1">Add documents and reference links for AI-powered search</p>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                <Button 
                  className="bg-primary text-primary-foreground w-40 h-10"
                  onClick={() => setShowUploadDialog(true)}
                  data-testid="button-upload-doc"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Upload Docs
                </Button>
                <Button 
                  variant="outline" 
                  className="w-40 h-10"
                  onClick={() => setShowLinkDialog(true)}
                  data-testid="button-add-link"
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Add Link
                </Button>
                <Button 
                  variant="outline" 
                  className="w-44 h-10 border-[#FB4F14]/50 hover:bg-[#FB4F14]/10"
                  onClick={() => setShowAiIngestDialog(true)}
                  data-testid="button-ai-ingest"
                >
                  <Bot className="w-4 h-4 mr-2 text-[#FB4F14]" />
                  AI Ingest URL
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4 max-w-sm">
                Add context descriptions to help the AI understand and search your content more effectively.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Upload Document Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
            <DialogDescription>
              Add a document to your knowledge base. Include context to help the AI understand and search it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDocSubmit} className="space-y-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
                isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
                selectedFile && "border-primary bg-primary/5"
              )}
              data-testid="dropzone-document"
            >
              <input
                type="file"
                id="file-input"
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.md,.mp3,.wav,.m4a,.mp4,.webm,.mov"
                onChange={handleFileInput}
                data-testid="input-file"
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                    <p className={cn(
                      "text-xs",
                      selectedFile.size > 25 * 1024 * 1024 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB 
                      {selectedFile.size > 25 * 1024 * 1024 ? " - File too large! Max 25MB" : " - Click to change"}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className={cn("w-8 h-8 mx-auto mb-2", isDragging ? "text-primary" : "text-muted-foreground")} />
                  <p className="text-sm text-muted-foreground">
                    {isDragging ? "Drop your file here" : "Click to select or drag & drop a file"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, audio (MP3, WAV), video (MP4), or text files (max 25MB)</p>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-title">Document Title</Label>
              <Input
                id="doc-title"
                placeholder="e.g., 2024 Budget Report"
                value={docForm.title}
                onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                data-testid="input-doc-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doc-type">Document Type</Label>
                <Select value={docForm.type} onValueChange={(v) => setDocForm({ ...docForm, type: v })}>
                  <SelectTrigger data-testid="select-doc-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="word">Word Document</SelectItem>
                    <SelectItem value="excel">Excel Spreadsheet</SelectItem>
                    <SelectItem value="text">Plain Text</SelectItem>
                    <SelectItem value="audio">Audio</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-category">Category</Label>
                <Select value={docForm.category} onValueChange={(v) => setDocForm({ ...docForm, category: v })}>
                  <SelectTrigger data-testid="select-doc-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="budget">Budget & Finance</SelectItem>
                    <SelectItem value="policy">Policy</SelectItem>
                    <SelectItem value="ordinance">Ordinance</SelectItem>
                    <SelectItem value="resolution">Resolution</SelectItem>
                    <SelectItem value="meeting">Meeting Minutes</SelectItem>
                    <SelectItem value="permit">Permits</SelectItem>
                    <SelectItem value="legal">Legal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!selectedFile && (
              <div className="space-y-2">
                <Label htmlFor="doc-content">Document Content (optional)</Label>
                <Textarea
                  id="doc-content"
                  placeholder="Paste or type the document content here..."
                  value={docForm.content}
                  onChange={(e) => setDocForm({ ...docForm, content: e.target.value })}
                  className="min-h-[100px]"
                  data-testid="textarea-doc-content"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="doc-description">AI Context Description</Label>
              <Textarea
                id="doc-description"
                placeholder="Describe what this document is about so the AI can search it effectively. e.g., 'Annual budget report covering municipal spending, revenue projections, and department allocations for fiscal year 2024.'"
                value={docForm.description}
                onChange={(e) => setDocForm({ ...docForm, description: e.target.value })}
                className="min-h-[80px]"
                data-testid="textarea-doc-description"
              />
              <p className="text-xs text-muted-foreground">This helps the AI understand and find this document when answering questions.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setShowUploadDialog(false);
                setSelectedFile(null);
              }}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={!docForm.title.trim() || uploadFileMutation.isPending || createDocumentMutation.isPending || (!selectedFile && !docForm.content) || (selectedFile !== null && selectedFile.size > 25 * 1024 * 1024)}
                data-testid="button-submit-doc"
              >
                {(uploadFileMutation.isPending || createDocumentMutation.isPending) ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {selectedFile ? "Uploading..." : "Adding..."}</>
                ) : (
                  selectedFile ? "Upload & Process" : "Add Document"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Reference Link</DialogTitle>
            <DialogDescription>
              Add a web link to your knowledge base. Include context to help the AI understand its relevance.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLinkSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="link-title">Link Title</Label>
              <Input
                id="link-title"
                placeholder="e.g., State Legislative Resource Center"
                value={linkForm.title}
                onChange={(e) => setLinkForm({ ...linkForm, title: e.target.value })}
                data-testid="input-link-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                type="url"
                placeholder="https://example.gov/resources"
                value={linkForm.url}
                onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })}
                data-testid="input-link-url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-tags">Tags (comma-separated)</Label>
              <Input
                id="link-tags"
                placeholder="e.g., legislation, reference, compliance"
                value={linkForm.tags}
                onChange={(e) => setLinkForm({ ...linkForm, tags: e.target.value })}
                data-testid="input-link-tags"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-description">AI Context Description</Label>
              <Textarea
                id="link-description"
                placeholder="Describe what this link contains so the AI can reference it effectively. e.g., 'Official state government portal with current legislation, bill tracking, and legislative calendars.'"
                value={linkForm.description}
                onChange={(e) => setLinkForm({ ...linkForm, description: e.target.value })}
                className="min-h-[80px]"
                data-testid="textarea-link-description"
              />
              <p className="text-xs text-muted-foreground">This helps the AI understand when to reference this link in responses.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowLinkDialog(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={!linkForm.title.trim() || !linkForm.url.trim() || createLinkMutation.isPending}
                data-testid="button-submit-link"
              >
                {createLinkMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Adding...</>
                ) : (
                  "Add Link"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* AI Ingest URL Dialog */}
      <Dialog open={showAiIngestDialog} onOpenChange={(open) => {
        setShowAiIngestDialog(open);
        if (!open) {
          setAiIngestUrl("");
          setAiIngestTitle("");
          setAiIngestedContent("");
        }
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-[#FB4F14]" />
              AI URL Content Ingestion
            </DialogTitle>
            <DialogDescription>
              Enter a URL and let AI extract and summarize the content for your knowledge base.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ingest-url">URL to Ingest</Label>
              <div className="flex gap-2">
                <Input
                  id="ingest-url"
                  type="url"
                  placeholder="https://example.gov/policy-document"
                  value={aiIngestUrl}
                  onChange={(e) => setAiIngestUrl(e.target.value)}
                  disabled={isAiIngesting}
                  data-testid="input-ingest-url"
                />
                <Button 
                  onClick={handleAiIngestUrl}
                  disabled={!aiIngestUrl.trim() || isAiIngesting}
                  className="bg-[#FB4F14] hover:bg-[#FB4F14]/90"
                  data-testid="button-fetch-url"
                >
                  {isAiIngesting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Fetch
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The AI will fetch the page content and create a searchable summary.
              </p>
            </div>

            {aiIngestedContent && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ingest-title">Document Title</Label>
                  <Input
                    id="ingest-title"
                    placeholder="e.g., City Council Meeting Policy"
                    value={aiIngestTitle}
                    onChange={(e) => setAiIngestTitle(e.target.value)}
                    data-testid="input-ingest-title"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Extracted Content</Label>
                  <div className="border rounded-lg p-4 bg-muted/30 max-h-[200px] overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">{aiIngestedContent}</p>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowAiIngestDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveIngestedContent}
              disabled={!aiIngestTitle.trim() || !aiIngestedContent.trim() || createDocumentMutation.isPending}
              data-testid="button-save-ingested"
            >
              {createDocumentMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                "Save to Knowledge Base"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: File, label: "Documents", value: documents.length, color: "text-[#002244]" },
          { icon: LinkIcon, label: "Reference Links", value: links.length, color: "text-[#FB4F14]" },
          { icon: Zap, label: "AI-Ready", value: "100%", color: "text-primary" },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className={cn("p-3 rounded-lg bg-muted", stat.color)}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search documents, links, and descriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            data-testid="input-search-knowledge"
          />
        </div>
        <Button variant="outline">
          <Tag className="w-4 h-4 mr-2" />
          Filter by Tags
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="links">Reference Links ({links.length})</TabsTrigger>
        </TabsList>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <div className="grid gap-4">
            {filteredDocuments.length === 0 && (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No documents found. Click "Upload Docs" to add your first document.</p>
              </Card>
            )}
            {filteredDocuments.map((doc, index) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:shadow-md transition-all group">
                  <CardContent className="p-3 md:pt-6">
                    <div className="flex items-start justify-between gap-2 md:gap-4">
                      <div className="flex items-start gap-2 md:gap-4 flex-1 min-w-0">
                        <div className={cn(
                          "p-2 md:p-3 rounded-lg transition-colors flex-shrink-0",
                          doc.type === "audio" ? "bg-purple-500/20 group-hover:bg-purple-500/30" :
                          doc.type === "video" ? "bg-blue-500/20 group-hover:bg-blue-500/30" :
                          "bg-[#002244]/20 group-hover:bg-[#002244]/30"
                        )}>
                          {doc.type === "audio" ? (
                            <Headphones className="w-4 md:w-5 h-4 md:h-5 text-purple-500" />
                          ) : doc.type === "video" ? (
                            <Video className="w-4 md:w-5 h-4 md:h-5 text-blue-500" />
                          ) : (
                            <FileText className="w-4 md:w-5 h-4 md:h-5 text-[#002244]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm md:text-base text-foreground group-hover:text-primary transition-colors truncate">
                              {doc.name}
                            </h3>
                            {doc.processingStatus === "processing" && (
                              <Loader2 className="w-4 h-4 text-primary animate-spin" />
                            )}
                            {doc.processingStatus === "completed" && doc.extractedContent && (
                              <CheckCircle2 className="w-4 h-4 text-[#FB4F14]" />
                            )}
                            {doc.processingStatus === "failed" && (
                              <AlertCircle className="w-4 h-4 text-destructive" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {doc.type.toUpperCase()} • {doc.size} • {doc.date}
                          </p>
                          {doc.processingStatus === "processing" && (
                            <p className="text-xs text-primary mt-1">Processing content...</p>
                          )}
                          {doc.processingStatus === "failed" && (
                            <p className="text-xs text-destructive mt-1">Processing failed</p>
                          )}
                          {doc.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.description}</p>
                          )}
                          <div className="flex gap-2 mt-2 md:mt-3 flex-wrap items-center">
                            {doc.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {doc.processingStatus === "completed" && doc.extractedContent && (
                              <Badge className="text-xs bg-[#FFF0E6] text-[#C43D0A] dark:bg-[#FB4F14]/20 dark:text-[#FFA07A]">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                AI Ready
                              </Badge>
                            )}
                            {doc.hasFile && !doc.extractedContent && doc.processingStatus !== "processing" && (
                              <Badge className="text-xs bg-amber-500/20 text-amber-700 dark:text-amber-400">
                                <Clock className="w-3 h-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {doc.extractedContent && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                            onClick={() => setViewDocId(doc.id)}
                            data-testid={`button-view-content-${doc.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {doc.hasFile && doc.processingStatus === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                            onClick={() => reprocessMutation.mutate(doc.id)}
                            disabled={reprocessMutation.isPending}
                            data-testid={`button-reprocess-${doc.id}`}
                          >
                            <RefreshCw className={cn("w-4 h-4", reprocessMutation.isPending && "animate-spin")} />
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-muted-foreground hover:text-destructive transition-colors h-8 w-8 p-0"
                              data-testid={`button-delete-document-${doc.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Document</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{doc.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteDocumentMutation.mutate(doc.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* Links Tab */}
        <TabsContent value="links" className="space-y-4">
          <div className="grid gap-4">
            {filteredLinks.length === 0 && (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No reference links found. Click "Add Link" to add your first link.</p>
              </Card>
            )}
            {filteredLinks.map((link, index) => (
              <motion.div
                key={link.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:shadow-md transition-all group">
                  <CardContent className="p-3 md:pt-6">
                    <div className="flex items-start justify-between gap-2 md:gap-4">
                      <div className="flex items-start gap-2 md:gap-4 flex-1 min-w-0">
                        <div className="p-2 md:p-3 rounded-lg bg-[#FB4F14]/20 dark:bg-[#FB4F14]/20 group-hover:bg-[#FB4F14]/30 dark:group-hover:bg-[#FB4F14]/30 transition-colors flex-shrink-0">
                          <Globe className="w-4 md:w-5 h-4 md:h-5 text-[#FB4F14]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm md:text-base text-foreground group-hover:text-primary transition-colors truncate">
                            {link.title}
                          </h3>
                          <a 
                            href={link.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-[#FB4F14] hover:underline truncate block"
                          >
                            {link.domain}
                          </a>
                          <p className="text-xs text-muted-foreground mt-0.5">Added {link.date}</p>
                          {link.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{link.description}</p>
                          )}
                          <div className="flex gap-2 mt-2 md:mt-3 flex-wrap">
                            {link.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 h-8 w-8 p-0"
                            data-testid={`button-delete-link-${link.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Link</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{link.title}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteLinkMutation.mutate(link.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Info Box */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Zap className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-foreground">AI-Powered Reference</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  All documents and links in this knowledge base are indexed and searchable by Civic Threads AI. The context descriptions you provide help the AI understand your content and find relevant information when answering questions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* View Extracted Content Dialog */}
      <Dialog open={viewDocId !== null} onOpenChange={(open) => !open && setViewDocId(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileType className="w-5 h-5" />
              Extracted Content
            </DialogTitle>
            <DialogDescription>
              {apiDocuments.find(d => d.id === viewDocId)?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[50vh] bg-muted/50 rounded-lg p-4">
            <pre className="text-sm whitespace-pre-wrap font-mono">
              {apiDocuments.find(d => d.id === viewDocId)?.extractedContent || "No content extracted"}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDocId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

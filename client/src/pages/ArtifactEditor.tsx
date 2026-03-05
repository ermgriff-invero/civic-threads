import { useState } from "react";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  Sparkles, 
  History, 
  MoreHorizontal,
  ChevronRight,
  Bold,
  Italic,
  List,
  Link as LinkIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";

export default function ArtifactEditor() {
  const [content, setContent] = useState(`
Background
Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat.

Analysis
The proposal aligns with the 2025 Strategic Plan. However, fiscal impact requires further review.

Recommendation
Approve the zoning amendment as drafted.
  `);

  return (
    <div className="h-screen bg-background flex flex-col md:flex-row overflow-hidden">
      
      {/* Editor Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b flex items-center justify-between px-6 bg-background z-10">
          <div className="flex items-center gap-4">
            <Link href="/thread/1">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
               <Badge variant="secondary" className="text-orange-600 bg-orange-50 hover:bg-orange-100 border-orange-200">Draft</Badge>
               <span className="text-sm text-muted-foreground">Last edited 2m ago</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <Button variant="ghost" size="sm" className="hidden md:flex">
               <History className="w-4 h-4 mr-2" />
               Version History
             </Button>
             <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
               Done Editing
             </Button>
          </div>
        </header>

        {/* Toolbar */}
        <div className="h-12 border-b flex items-center px-6 gap-2 bg-muted/10">
           <Button variant="ghost" size="icon" className="h-8 w-8"><Bold className="w-4 h-4" /></Button>
           <Button variant="ghost" size="icon" className="h-8 w-8"><Italic className="w-4 h-4" /></Button>
           <Button variant="ghost" size="icon" className="h-8 w-8"><LinkIcon className="w-4 h-4" /></Button>
           <Separator orientation="vertical" className="h-6 mx-2" />
           <Button variant="ghost" size="icon" className="h-8 w-8"><List className="w-4 h-4" /></Button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-12 px-8">
            <input 
              type="text" 
              className="w-full text-4xl font-bold border-none outline-none bg-transparent placeholder:text-muted-foreground mb-8"
              defaultValue="Staff Report: Zoning Amendment"
            />
            
            <textarea 
              className="w-full h-[600px] resize-none border-none outline-none text-lg leading-relaxed bg-transparent font-serif text-foreground/90"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* AI Side Panel */}
      <div className="w-80 border-l bg-muted/20 flex flex-col">
        <div className="p-4 border-b flex items-center gap-2 font-semibold text-primary">
          <Sparkles className="w-4 h-4" />
          Civic Threads AI
        </div>
        
        <ScrollArea className="flex-1 p-4">
           <div className="space-y-4">
             <div className="bg-card border shadow-sm rounded-lg p-4">
               <h4 className="text-sm font-medium mb-2">Suggested Content</h4>
               <p className="text-xs text-muted-foreground mb-3">
                 Based on <span className="text-primary cursor-pointer hover:underline">Ordinance 2023-45</span>, you typically include a "Fiscal Impact" section here.
               </p>
               <Button variant="outline" size="sm" className="w-full text-xs border-primary/20 hover:bg-primary/5 text-primary">
                 <Sparkles className="w-3 h-3 mr-2" />
                 Insert Draft Section
               </Button>
             </div>

             <div className="bg-card border shadow-sm rounded-lg p-4">
               <h4 className="text-sm font-medium mb-2">Similar Precedents</h4>
               <div className="space-y-2">
                 <div className="flex items-start gap-2 text-xs p-2 hover:bg-muted rounded cursor-pointer transition-colors">
                    <History className="w-3 h-3 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-foreground">Downtown Revitalization 2021</p>
                      <p className="text-muted-foreground">Approved • 3 years ago</p>
                    </div>
                 </div>
                 <div className="flex items-start gap-2 text-xs p-2 hover:bg-muted rounded cursor-pointer transition-colors">
                    <History className="w-3 h-3 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-foreground">North Side Zoning Fix</p>
                      <p className="text-muted-foreground">Denied • 1 year ago</p>
                    </div>
                 </div>
               </div>
             </div>
           </div>
        </ScrollArea>
        
        <div className="p-4 border-t bg-background">
          <Button className="w-full bg-gradient-to-r from-primary to-[#C43D0A] hover:from-[#C43D0A] hover:to-primary transition-all shadow-lg shadow-primary/20">
             <Sparkles className="w-4 h-4 mr-2" />
             Auto-Complete Draft
          </Button>
        </div>
      </div>
    </div>
  );
}

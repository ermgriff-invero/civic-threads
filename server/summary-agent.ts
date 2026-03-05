import OpenAI from "openai";
import { storage } from "./storage";
import type { Thread, Document } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface SummaryAction {
  type: "view_thread" | "start_thread";
  label: string;
  threadId?: number;
  suggestedTitle?: string;
  suggestedType?: string;
}

export interface SummaryResponse {
  content: string;
  actions: SummaryAction[];
}

interface ContextData {
  threads: Thread[];
  documents: Document[];
  recentThreads: Thread[];
}

async function gatherContext(query: string): Promise<ContextData> {
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const searchTerms = keywords.slice(0, 3);
  
  const [recentThreads, ...searchResults] = await Promise.all([
    storage.getRecentThreads(5),
    ...searchTerms.map(term => storage.searchThreads(term)),
    ...searchTerms.map(term => storage.searchDocuments(term))
  ]);

  const threadResults = searchResults.slice(0, searchTerms.length).flat() as Thread[];
  const docResults = searchResults.slice(searchTerms.length).flat() as Document[];

  const uniqueThreads = Array.from(new Map(threadResults.map(t => [t.id, t])).values());
  const uniqueDocs = Array.from(new Map(docResults.map(d => [d.id, d])).values());

  return {
    threads: uniqueThreads.slice(0, 5),
    documents: uniqueDocs.slice(0, 5),
    recentThreads
  };
}

function buildSystemPrompt(context: ContextData): string {
  const threadContext = context.threads.length > 0 
    ? `\nRelevant existing threads:\n${context.threads.map(t => 
        `- Thread #${t.id}: "${t.title}" (${t.type}, Status: ${t.status})${t.topic ? ` - Topic: ${t.topic}` : ''}`
      ).join('\n')}`
    : '';

  const docContext = context.documents.length > 0
    ? `\nRelevant knowledge base documents:\n${context.documents.map(d => 
        `- "${d.title}" (${d.category})${d.content ? `: ${d.content.substring(0, 200)}...` : ''}`
      ).join('\n')}`
    : '';

  const recentContext = context.recentThreads.length > 0
    ? `\nRecent activity:\n${context.recentThreads.map(t => 
        `- Thread #${t.id}: "${t.title}" (${t.status})`
      ).join('\n')}`
    : '';

  return `You are the Civic Threads AI assistant, helping municipal government staff with their work. You provide helpful summaries and guidance based on institutional knowledge.

CONTEXT:${threadContext}${docContext}${recentContext}

RESPONSE RULES:
1. Be concise and professional. Use plain language suitable for government staff.
2. When answering informational questions, reference the knowledge base and existing threads when relevant.
3. Determine if the user's request requires ACTION:
   - If they should review an existing thread, include ACTION_REVIEW_THREAD in your response
   - If they should start a new thread, include ACTION_START_THREAD in your response
4. Format actions like this at the END of your response:
   - For reviewing a thread: [[ACTION_REVIEW_THREAD:threadId:Thread Title]]
   - For starting a new thread: [[ACTION_START_THREAD:Suggested Title:Thread Type]]
   
Thread types are: Ordinance, Resolution, Report, Amendment, Policy

EXAMPLES:
- User asks "What was decided about the parking ordinance?" 
  Response: Based on our records, the Downtown Parking Ordinance (Thread #3) was approved last month... [[ACTION_REVIEW_THREAD:3:Downtown Parking Ordinance]]

- User asks "I need to draft a new budget amendment"
  Response: I can help you start a budget amendment thread. This will guide you through the required steps... [[ACTION_START_THREAD:Budget Amendment 2024:Amendment]]

- User asks "What's the status of pending resolutions?"
  Response: You currently have 2 resolutions in progress... (informational, no action needed)

Keep responses focused and helpful. Only suggest actions when they're genuinely useful.`;
}

function parseActions(content: string): { cleanContent: string; actions: SummaryAction[] } {
  const actions: SummaryAction[] = [];
  let cleanContent = content;

  const reviewPattern = /\[\[ACTION_REVIEW_THREAD:(\d+):([^\]]+)\]\]/g;
  let match;
  while ((match = reviewPattern.exec(content)) !== null) {
    actions.push({
      type: "view_thread",
      label: `Review: ${match[2]}`,
      threadId: parseInt(match[1])
    });
    cleanContent = cleanContent.replace(match[0], '');
  }

  const startPattern = /\[\[ACTION_START_THREAD:([^:]+):([^\]]+)\]\]/g;
  while ((match = startPattern.exec(content)) !== null) {
    actions.push({
      type: "start_thread",
      label: `Start: ${match[1]}`,
      suggestedTitle: match[1],
      suggestedType: match[2]
    });
    cleanContent = cleanContent.replace(match[0], '');
  }

  return { cleanContent: cleanContent.trim(), actions };
}

export async function* streamSummaryResponse(
  userMessage: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): AsyncGenerator<{ type: 'token' | 'actions' | 'done' | 'error'; content?: string; actions?: SummaryAction[]; error?: string }> {
  try {
    const context = await gatherContext(userMessage);
    const systemPrompt = buildSystemPrompt(context);

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(m => ({ 
        role: m.role as 'user' | 'assistant', 
        content: m.content 
      })),
      { role: 'user', content: userMessage }
    ];

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      stream: true,
      max_completion_tokens: 1000,
    });

    let fullContent = '';
    let buffer = '';
    const ACTION_MARKER_START = '[[ACTION';

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        fullContent += token;
        buffer += token;
        
        const markerIndex = buffer.indexOf(ACTION_MARKER_START);
        
        if (markerIndex === -1) {
          const potentialStart = buffer.lastIndexOf('[');
          if (potentialStart !== -1 && potentialStart > buffer.length - 15) {
            const safeContent = buffer.slice(0, potentialStart);
            if (safeContent) {
              yield { type: 'token', content: safeContent };
            }
            buffer = buffer.slice(potentialStart);
          } else {
            yield { type: 'token', content: buffer };
            buffer = '';
          }
        } else {
          const safeContent = buffer.slice(0, markerIndex);
          if (safeContent) {
            yield { type: 'token', content: safeContent };
          }
          buffer = buffer.slice(markerIndex);
        }
      }
    }

    if (buffer && !buffer.startsWith(ACTION_MARKER_START)) {
      const cleanBuffer = buffer.replace(/\[\[ACTION[^\]]*\]\]/g, '').trim();
      if (cleanBuffer) {
        yield { type: 'token', content: cleanBuffer };
      }
    }

    const { actions } = parseActions(fullContent);
    
    if (actions.length > 0) {
      yield { type: 'actions', actions };
    }

    yield { type: 'done' };
  } catch (error) {
    console.error("Error in streamSummaryResponse:", error);
    yield { type: 'error', error: 'Failed to generate response' };
  }
}

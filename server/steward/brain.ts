import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface KnowledgeBaseDocument {
  id: number;
  title: string;
  type: string;
  description?: string | null;
  extractedContent?: string | null;
  processingStatus?: string | null;
}

export interface ThreadContext {
  thread: { id: number; title: string; type: string; status: string };
  nodes: Array<{ id: string; type: string; label: string }>;
  documents?: Array<{ id: number; title: string; type: string }>;
  knowledgeBaseDocuments?: KnowledgeBaseDocument[];
  hasSelectedDocuments?: boolean;
}

export interface Citation {
  url?: string;
  documentId?: number;
  title: string;
  snippet: string;
}

export interface ResearchResponse {
  answer: string;
  citations: Citation[];
  suggestedNextSteps: string[];
}

export interface SuggestionPayload {
  type: string;
  title: string;
  rationale: string;
  actionPayload: any;
  priority: number;
}

export interface IdealThreadNode {
  kind: string;
  title: string;
  why: string;
  defaultIncluded: boolean;
  initialContentOutline: string;
}

const THREAD_TYPE_REQUIREMENTS: Record<string, string[]> = {
  Ordinance: ["Research", "StaffReport", "PublicInputSummary", "ImpactAssessment", "ImplementationPlan", "DecisionLog"],
  Resolution: ["Research", "StaffReport", "DecisionLog"],
  Report: ["Research", "Memo", "ImpactAssessment"],
  Amendment: ["Research", "StaffReport", "DecisionLog", "ImpactAssessment"],
};

export function getRequiredNodeTypes(threadType: string): string[] {
  return THREAD_TYPE_REQUIREMENTS[threadType] || THREAD_TYPE_REQUIREMENTS.Ordinance;
}

function buildKnowledgeBaseContext(docs: KnowledgeBaseDocument[], hasSelectedDocuments?: boolean): string {
  if (!docs || docs.length === 0) return "";
  
  const docsWithContent = docs.filter(d => d.extractedContent && d.processingStatus === "completed");
  if (docsWithContent.length === 0) return "";
  
  let context = "\n\n=== KNOWLEDGE BASE DOCUMENTS ===\n";
  if (hasSelectedDocuments) {
    context += "CRITICAL: The user has specifically selected these documents to focus their research. You MUST:\n";
    context += "1. FIRST review ALL the content in these documents before answering\n";
    context += "2. BASE your answer primarily on information found in these documents\n";
    context += "3. ALWAYS cite these documents when they contain relevant information\n";
    context += "4. If the documents don't contain the answer, clearly state that and then provide general knowledge\n\n";
  } else {
    context += "IMPORTANT: Always review these Knowledge Base documents FIRST before answering any question.\n";
    context += "You MUST cite these documents when they contain relevant information. Use the document ID and title in citations.\n\n";
  }
  
  for (const doc of docsWithContent) {
    const truncatedContent = doc.extractedContent!.substring(0, 8000);
    context += `--- Document ID: ${doc.id} ---\n`;
    context += `Title: ${doc.title}\n`;
    context += `Type: ${doc.type}\n`;
    if (doc.description) context += `Description: ${doc.description}\n`;
    context += `Content:\n${truncatedContent}\n`;
    if (doc.extractedContent!.length > 8000) {
      context += "[... content truncated ...]\n";
    }
    context += "\n";
  }
  
  return context;
}

export async function answerResearchQuestion(
  threadContext: ThreadContext,
  question: string
): Promise<ResearchResponse> {
  const knowledgeContext = buildKnowledgeBaseContext(threadContext.knowledgeBaseDocuments || [], threadContext.hasSelectedDocuments);
  
  const priorityInstruction = threadContext.hasSelectedDocuments 
    ? "CRITICAL: The user has selected specific Knowledge Base documents. You MUST read and analyze these documents FIRST before answering. Base your answer primarily on information from these documents."
    : `MANDATORY WORKFLOW: 
1. FIRST search ALL Knowledge Base documents provided
2. Extract relevant information from documents  
3. Use document information as PRIMARY source
4. Only supplement with general knowledge if needed
5. ALWAYS cite documents when using their information`;
  
  const systemPrompt = `You are a research assistant for municipal government staff helping with civic processes.

${priorityInstruction}

Current thread context:
- Title: ${threadContext.thread.title}
- Type: ${threadContext.thread.type}
- Status: ${threadContext.thread.status}
- Existing nodes: ${threadContext.nodes.map(n => `${n.type}: ${n.label}`).join(", ") || "None"}
${threadContext.documents?.length ? `- Related documents: ${threadContext.documents.map(d => `${d.type}: ${d.title}`).join(", ")}` : ""}
${knowledgeContext}

CITATION INSTRUCTIONS:
- When referencing information from Knowledge Base documents, you MUST include a citation.
- Format citations with the document title and relevant excerpt/snippet.
- For Knowledge Base documents, set "documentId" to the document's ID number.
- Always prefer citing actual documents over general knowledge.
- If Knowledge Base documents contain the answer, you MUST use that information and cite it.

Your response must be valid JSON with this structure:
{
  "answer": "Your detailed answer here with inline references like [1], [2], etc.",
  "citations": [{"documentId": 123, "title": "source title", "snippet": "relevant excerpt from the document"}],
  "suggestedNextSteps": ["step 1", "step 2"]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content || "{}";
  
  try {
    const parsed = JSON.parse(content);
    return {
      answer: parsed.answer || "Unable to generate response",
      citations: parsed.citations || [],
      suggestedNextSteps: parsed.suggestedNextSteps || [],
    };
  } catch {
    return {
      answer: content,
      citations: [],
      suggestedNextSteps: [],
    };
  }
}

export async function answerResearchQuestionStream(
  threadContext: ThreadContext,
  question: string
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const knowledgeContext = buildKnowledgeBaseContext(threadContext.knowledgeBaseDocuments || [], threadContext.hasSelectedDocuments);
  
  const priorityInstruction = threadContext.hasSelectedDocuments 
    ? `CRITICAL INSTRUCTION: The user has selected specific Knowledge Base documents to focus their research.
You MUST:
1. READ and ANALYZE these selected documents FIRST before answering
2. BASE your answer primarily on information found in these documents
3. ALWAYS cite these documents when they contain relevant information
4. If the documents don't contain the answer, clearly state that and then provide general knowledge`
    : `MANDATORY WORKFLOW - Follow this EXACT order for EVERY question:
1. FIRST: Search through ALL Knowledge Base documents provided below
2. SECOND: Extract any relevant information from those documents
3. THIRD: If documents contain relevant information, use it as the PRIMARY source for your answer
4. FOURTH: Only supplement with general knowledge if documents don't fully answer the question
5. ALWAYS cite documents when you use information from them

You have access to the user's Knowledge Base documents. Use them as your primary source of truth.`;
  
  const systemPrompt = `You are a research assistant for municipal government staff helping with civic processes.

${priorityInstruction}

Current thread context:
- Title: ${threadContext.thread.title}
- Type: ${threadContext.thread.type}
- Status: ${threadContext.thread.status}
- Existing nodes: ${threadContext.nodes.map(n => `${n.type}: ${n.label}`).join(", ") || "None"}
${threadContext.documents?.length ? `- Related documents: ${threadContext.documents.map(d => `${d.type}: ${d.title}`).join(", ")}` : ""}
${knowledgeContext}

CITATION REQUIREMENTS:
- When your answer draws from Knowledge Base documents, you MUST cite them.
- Format inline citations like: "According to [Document Title]..." or end sentences with "(Source: Document Title)"
- Always prefer citing actual documents from the Knowledge Base over general knowledge.
- If the Knowledge Base documents answer the question, use that information.

Provide helpful, accurate research assistance for civic processes including ordinances, resolutions, reports, and policy research.`;

  return openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
    stream: true,
    max_completion_tokens: 2048,
  });
}

export async function generateSuggestions(
  threadContext: ThreadContext
): Promise<SuggestionPayload[]> {
  const requiredTypes = getRequiredNodeTypes(threadContext.thread.type);
  const existingTypes = threadContext.nodes.map(n => n.type);
  const missingTypes = requiredTypes.filter(t => !existingTypes.includes(t));

  const systemPrompt = `You are an AI steward for municipal government legislative threads. 
Analyze the thread and suggest improvements.

Thread context:
- Title: ${threadContext.thread.title}
- Type: ${threadContext.thread.type}
- Status: ${threadContext.thread.status}
- Required node types for this thread type: ${requiredTypes.join(", ")}
- Existing nodes: ${threadContext.nodes.map(n => `${n.type}: ${n.label}`).join(", ") || "None"}
- Missing node types: ${missingTypes.join(", ") || "All required types present"}
${threadContext.documents?.length ? `- Related documents: ${threadContext.documents.map(d => `${d.type}: ${d.title}`).join(", ")}` : ""}

Generate actionable suggestions to improve this thread. Focus on:
1. Missing required nodes
2. Risks or gaps in the current structure
3. Next steps to advance the thread

Return a JSON array of suggestions with this structure:
[{
  "type": "CREATE_NODE" | "REVISE_NODE" | "FLAG_RISK" | "NEXT_STEP",
  "title": "Brief suggestion title",
  "rationale": "Why this is important",
  "actionPayload": { "nodeType": "...", "suggestedLabel": "...", ... },
  "priority": 1-5 (5 being highest priority)
}]`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Analyze this thread and generate improvement suggestions." },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content || "{}";
  
  try {
    const parsed = JSON.parse(content);
    const suggestions = parsed.suggestions || parsed;
    return Array.isArray(suggestions) ? suggestions : [];
  } catch {
    return [];
  }
}

export async function buildIdealThreadPlan(
  threadContext: ThreadContext
): Promise<IdealThreadNode[]> {
  const requiredTypes = getRequiredNodeTypes(threadContext.thread.type);

  const systemPrompt = `You are an AI steward helping plan the ideal structure for a municipal government legislative thread.

Thread context:
- Title: ${threadContext.thread.title}
- Type: ${threadContext.thread.type}
- Status: ${threadContext.thread.status}
- Required node types for this thread type: ${requiredTypes.join(", ")}
- Existing nodes: ${threadContext.nodes.map(n => `${n.type}: ${n.label}`).join(", ") || "None"}

Build an ideal thread plan with all recommended nodes. For each node, specify:
- What content it should contain
- Why it's needed for this type of thread
- Whether it should be included by default
- An outline of what the initial content should cover

Return a JSON object with a "nodes" array:
{
  "nodes": [{
    "kind": "Research" | "StaffReport" | "PublicInputSummary" | "ImpactAssessment" | "ImplementationPlan" | "DecisionLog" | "Memo",
    "title": "Descriptive title for this node",
    "why": "Explanation of why this node is important",
    "defaultIncluded": true/false,
    "initialContentOutline": "Bullet points of what this node should contain"
  }]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Create an ideal thread plan for this legislative thread." },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content || "{}";
  
  try {
    const parsed = JSON.parse(content);
    return parsed.nodes || [];
  } catch {
    return [];
  }
}

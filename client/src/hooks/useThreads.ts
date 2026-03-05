import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface Thread {
  id: number;
  title: string;
  status: string;
  type: string;
  author: string;
  topic: string | null;
  description: string | null;
  outcome: string | null;
  createdAt: string;
  updatedAt: string;
}

export type InsertThread = {
  title: string;
  type: string;
  author: string;
  status?: string;
  topic?: string;
  description?: string;
  outcome?: string;
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString();
}

export function useThreads() {
  const queryClient = useQueryClient();

  const { data: threads = [], isLoading, error } = useQuery<Thread[]>({
    queryKey: ['/api/threads'],
  });

  const createMutation = useMutation({
    mutationFn: async (threadData: InsertThread) => {
      const res = await apiRequest('POST', '/api/threads', threadData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/threads'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<InsertThread> }) => {
      const res = await apiRequest('PATCH', `/api/threads/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/threads'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/threads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/threads'] });
    },
  });

  const addThread = (threadData: Omit<InsertThread, 'status'>) => {
    createMutation.mutate({ ...threadData, status: 'Drafting' });
    return { id: Date.now(), ...threadData, status: 'Drafting' as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  };

  const updateThread = (id: number, updates: Partial<InsertThread>) => {
    updateMutation.mutate({ id, updates });
  };

  const deleteThread = (id: number) => {
    deleteMutation.mutate(id);
  };

  const getThreadById = (id: number) => {
    return threads.find((thread) => thread.id === id);
  };

  const threadsWithFormattedDates = threads.map((t) => ({
    ...t,
    date: formatDate(t.updatedAt),
  }));

  return {
    threads: threadsWithFormattedDates,
    addThread,
    updateThread,
    deleteThread,
    getThreadById,
    isLoaded: !isLoading,
    isLoading,
    error,
  };
}

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronUp, Plus, Search, Megaphone, Loader2 } from "lucide-react";
import { usePlan } from "@/hooks/use-plan";
import { useToast } from "@/hooks/use-toast";

type Category = "bug" | "feature_request" | "improvement" | "ux_issue";
type Status = "planned" | "in_progress" | "released";

const CATEGORY_LABELS: Record<Category, string> = {
  bug: "Bug",
  feature_request: "Feature Request",
  improvement: "Improvement",
  ux_issue: "UX Issue",
};

const CATEGORY_COLORS: Record<Category, string> = {
  bug: "bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400",
  feature_request: "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400",
  improvement: "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
  ux_issue: "bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-900/20 dark:text-violet-400",
};

const STATUS_LABELS: Record<Status, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  released: "Released",
};

const STATUS_COLORS: Record<Status, string> = {
  planned: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/15 text-primary border border-primary/30",
  released: "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400",
};

interface FeedbackPost {
  id: number;
  userId: string;
  title: string;
  description: string;
  category: Category;
  status: Status;
  upvotes: number;
  hasVoted: boolean;
  createdAt: string;
}

async function fetchFeedback(): Promise<FeedbackPost[]> {
  const res = await fetch("/api/feedback", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load feedback");
  return res.json();
}

async function createPost(data: { title: string; description: string; category: Category }) {
  const res = await fetch("/api/feedback", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create post");
  return res.json();
}

async function toggleVote(postId: number) {
  const res = await fetch(`/api/feedback/${postId}/vote`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to vote");
  return res.json();
}

async function updateStatus(postId: number, status: Status) {
  const res = await fetch(`/api/feedback/${postId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update status");
  return res.json();
}

function NewPostDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("feature_request");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      setDescription("");
      setCategory("feature_request");
      onSuccess();
      toast({ title: "Posted!", description: "Your feedback has been submitted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit feedback. Try again.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    mutation.mutate({ title: title.trim(), description: description.trim(), category });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          New Post
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit Feedback</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="fb-title">Title</Label>
            <Input
              id="fb-title"
              placeholder="Short, clear summary"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-description">Description</Label>
            <Textarea
              id="fb-description"
              placeholder="Describe the issue or idea in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(CATEGORY_LABELS) as [Category, string][]).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function FeedbackPage() {
  const qc = useQueryClient();
  const { isAdmin } = usePlan();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: posts = [], isLoading } = useQuery<FeedbackPost[]>({
    queryKey: ["feedback"],
    queryFn: fetchFeedback,
  });

  const voteMutation = useMutation({
    mutationFn: toggleVote,
    onMutate: async (postId) => {
      await qc.cancelQueries({ queryKey: ["feedback"] });
      const prev = qc.getQueryData<FeedbackPost[]>(["feedback"]);
      qc.setQueryData<FeedbackPost[]>(["feedback"], (old = []) =>
        old.map((p) =>
          p.id === postId
            ? { ...p, hasVoted: !p.hasVoted, upvotes: p.hasVoted ? p.upvotes - 1 : p.upvotes + 1 }
            : p
        )
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["feedback"], ctx.prev);
      toast({ title: "Error", description: "Could not record your vote.", variant: "destructive" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["feedback"] }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Status }) => updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback"] }),
    onError: () => toast({ title: "Error", description: "Failed to update status.", variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        CATEGORY_LABELS[p.category]?.toLowerCase().includes(q)
    );
  }, [posts, search]);

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-5">
      <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 flex items-start gap-3">
        <Megaphone className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <p className="text-sm text-foreground">
          <span className="font-semibold">You're part of the early beta</span> — vote on what we build next.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search feedback..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <NewPostDialog onSuccess={() => qc.invalidateQueries({ queryKey: ["feedback"] })} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {search ? "No matching posts found." : "No feedback yet — be the first to share an idea!"}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => (
            <Card key={post.id} className="border border-border/60">
              <CardContent className="p-4 flex gap-4 items-start">
                <button
                  onClick={() => voteMutation.mutate(post.id)}
                  disabled={voteMutation.isPending}
                  className={`flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-2 min-w-[52px] transition-colors border ${
                    post.hasVoted
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-muted/40 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <ChevronUp className={`w-4 h-4 ${post.hasVoted ? "stroke-2" : ""}`} />
                  <span className="text-sm font-semibold leading-none">{post.upvotes}</span>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm">{post.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{post.description}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[post.category] || ""}`}>
                      {CATEGORY_LABELS[post.category] || post.category}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[post.status] || ""}`}>
                      {STATUS_LABELS[post.status] || post.status}
                    </span>
                    {isAdmin && (
                      <Select
                        value={post.status}
                        onValueChange={(v) => statusMutation.mutate({ id: post.id, status: v as Status })}
                      >
                        <SelectTrigger className="h-6 text-xs px-2 py-0 w-auto border-dashed">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planned">Planned</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="released">Released</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

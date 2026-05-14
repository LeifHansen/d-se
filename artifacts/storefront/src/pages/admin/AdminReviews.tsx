import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminReviews,
  useModerateReview,
  useDeleteReview,
  getListAdminReviewsQueryKey,
  type Review,
} from "@workspace/api-client-react";
import { AdminLayout } from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type Filter = "pending" | "approved" | "rejected" | "all";

function statusBadgeVariant(s: Review["status"]): "default" | "secondary" | "destructive" {
  if (s === "approved") return "default";
  if (s === "rejected") return "destructive";
  return "secondary";
}

function stars(rating: number): string {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

export default function AdminReviews() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("pending");

  const params = filter === "all" ? undefined : { status: filter };
  const list = useListAdminReviews(params);

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: getListAdminReviewsQueryKey().slice(0, 1),
    });

  const moderate = useModerateReview({
    mutation: {
      onSuccess: (_d, vars) => {
        invalidate();
        toast({ title: `Review ${vars.data.status}` });
      },
      onError: (e: Error) =>
        toast({ title: "Update failed", description: e.message }),
    },
  });

  const remove = useDeleteReview({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Review deleted" });
      },
      onError: (e: Error) =>
        toast({ title: "Delete failed", description: e.message }),
    },
  });

  return (
    <AdminLayout title="Reviews moderation">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-foreground/70">
          Approve, reject, or remove customer-submitted reviews. Approved
          reviews are visible on the storefront.
        </p>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="pending" data-testid="reviews-tab-pending">
              Pending
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="reviews-tab-approved">
              Approved
            </TabsTrigger>
            <TabsTrigger value="rejected" data-testid="reviews-tab-rejected">
              Rejected
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="reviews-tab-all">
              All
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-md border border-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Review</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {list.isError && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-destructive"
                >
                  Failed to load reviews.
                </TableCell>
              </TableRow>
            )}
            {list.data?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-foreground/60"
                >
                  No reviews in this view.
                </TableCell>
              </TableRow>
            )}
            {list.data?.map((r) => (
              <TableRow key={r.id} data-testid={`review-row-${r.id}`}>
                <TableCell>
                  <div className="font-medium">{r.productName ?? "—"}</div>
                  {r.productSlug && (
                    <div className="text-xs text-foreground/50">
                      {r.productSlug}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <span aria-label={`${r.rating} out of 5`} title={`${r.rating}/5`}>
                    {stars(r.rating)}
                  </span>
                </TableCell>
                <TableCell className="max-w-md">
                  <div className="font-medium">{r.title}</div>
                  <p className="line-clamp-3 text-xs text-foreground/70">
                    {r.body}
                  </p>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.authorName ?? "Anonymous"}</div>
                  {r.verifiedPurchase && (
                    <Badge variant="outline" className="mt-1 text-xs">
                      Verified
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(r.status)}>
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {r.status !== "approved" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          moderate.mutate({
                            id: r.id,
                            data: { status: "approved" },
                          })
                        }
                        data-testid={`review-approve-${r.id}`}
                      >
                        Approve
                      </Button>
                    )}
                    {r.status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          moderate.mutate({
                            id: r.id,
                            data: { status: "rejected" },
                          })
                        }
                        data-testid={`review-reject-${r.id}`}
                      >
                        Reject
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete this review permanently?"))
                          remove.mutate({ id: r.id });
                      }}
                      data-testid={`review-delete-${r.id}`}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminLayout>
  );
}

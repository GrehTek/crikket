"use client"

import { Button } from "@crikket/ui/components/ui/button"
import { Loader2, Play } from "lucide-react"

import { SelectionActionBar } from "@/components/selection-action-bar"
import { useBugReportsActions } from "../../_hooks/use-bug-reports-actions"
import { useBugReportsData } from "../../_hooks/use-bug-reports-data"
import { useBugReportsFilters } from "../../_hooks/use-bug-reports-filters"
import { BugReportCard } from "./bug-report-card"
import { BugReportsBulkActions } from "./bug-reports-bulk-actions"
import { BugReportsDeleteDialogs } from "./bug-reports-delete-dialogs"
import { BugReportsToolbar } from "./bug-reports-toolbar"

export function BugReportsList() {
  const {
    debouncedSearch,
    sort,
    filters,
    clearFilters,
    setSearchValue,
    setSort,
    togglePriority,
    toggleStatus,
    toggleVisibility,
    searchValue,
    hasActiveFilters,
  } = useBugReportsFilters()

  const {
    reports,
    stats,
    refetchAll,
    isError,
    errorMessage,
    isLoading,
    isFetching,
    refetch,
    loadMoreRef,
  } = useBugReportsData({
    search: debouncedSearch,
    sort,
    filters,
  })

  const {
    selectedIds,
    selectedCount,
    clearSelection,
    toggleSelection,
    deleteReportId,
    setDeleteReportId,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    bulkStatus,
    setBulkStatus,
    bulkPriority,
    setBulkPriority,
    bulkVisibility,
    setBulkVisibility,
    bulkTagsInput,
    setBulkTagsInput,
    isMutating,
    updateMutation,
    deleteMutation,
    bulkDeleteMutation,
    handleBulkDelete,
    handleBulkUpdate,
  } = useBugReportsActions({
    reportIds: reports.map((report) => report.id),
    refetchAll,
  })

  return (
    <div
      className={
        selectedCount > 0 ? "space-y-4 pb-40 sm:pb-32 lg:pb-28" : "space-y-4"
      }
    >
      <BugReportsToolbar
        filters={filters}
        onClearFilters={clearFilters}
        onSearchChange={setSearchValue}
        onSortChange={setSort}
        onTogglePriority={togglePriority}
        onToggleStatus={toggleStatus}
        onToggleVisibility={toggleVisibility}
        search={searchValue}
        sort={sort}
        stats={stats}
      />

      <SelectionActionBar
        actions={
          <BugReportsBulkActions
            bulkPriority={bulkPriority}
            bulkStatus={bulkStatus}
            bulkTagsInput={bulkTagsInput}
            bulkVisibility={bulkVisibility}
            isMutating={isMutating}
            onApplyUpdates={handleBulkUpdate}
            onBulkPriorityChange={setBulkPriority}
            onBulkStatusChange={setBulkStatus}
            onBulkTagsChange={setBulkTagsInput}
            onBulkVisibilityChange={setBulkVisibility}
            onRequestBulkDelete={() => setBulkDeleteOpen(true)}
          />
        }
        onClearSelection={clearSelection}
        selectedCount={selectedCount}
      />

      {isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="font-medium text-sm">Failed to load bug reports</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {errorMessage || "Unexpected error"}
          </p>
          <Button
            className="mt-3"
            onClick={() => refetch()}
            size="sm"
            variant="outline"
          >
            Retry
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {["s1", "s2", "s3", "s4"].map((skeletonKey) => (
            <div
              className="aspect-video w-full animate-pulse rounded-lg bg-muted"
              key={skeletonKey}
            />
          ))}
        </div>
      ) : null}

      {!isLoading && reports.length === 0 && !isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border py-20">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <Play className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h2 className="font-semibold text-2xl">
              {hasActiveFilters ? "No matching reports" : "No bug reports yet"}
            </h2>
            <p className="mt-2 text-muted-foreground text-sm">
              {hasActiveFilters
                ? "Try adjusting your search or filters."
                : "Start reporting bugs to see them here."}
            </p>
          </div>
        </div>
      ) : null}

      {reports.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {reports.map((report) => (
            <BugReportCard
              isChecked={selectedIds.has(report.id)}
              isMutating={isMutating}
              key={report.id}
              onRequestDelete={() => setDeleteReportId(report.id)}
              onToggleSelection={(checked) =>
                toggleSelection(report.id, checked)
              }
              onUpdateReport={(input) =>
                updateMutation.mutate({
                  id: report.id,
                  ...input,
                })
              }
              report={report}
            />
          ))}
        </div>
      ) : null}

      {isFetching ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      <div aria-hidden className="h-1 w-full" ref={loadMoreRef} />

      <BugReportsDeleteDialogs
        bulkDeleteOpen={bulkDeleteOpen}
        deleteReportId={deleteReportId}
        isBulkDeleteLoading={bulkDeleteMutation.isPending}
        isSingleDeleteLoading={deleteMutation.isPending}
        onBulkDeleteConfirm={handleBulkDelete}
        onBulkDeleteOpenChange={setBulkDeleteOpen}
        onSingleDeleteConfirm={async () => {
          if (!deleteReportId) {
            return
          }

          await deleteMutation.mutateAsync(deleteReportId)
          setDeleteReportId(null)
        }}
        onSingleDeleteOpenChange={(open) => {
          if (!open) {
            setDeleteReportId(null)
          }
        }}
        selectedCount={selectedCount}
      />
    </div>
  )
}

/**
 * Sidebar — document list with upload and delete actions.
 *
 * Shows all documents from Neo4j, ordered newest first.
 * Each document displays status indicators:
 *   ✓ (indexed)  ⏳ (processing)  ✗ (failed)
 *
 * Actions: upload new doc (opens modal), delete doc (with confirmation).
 */
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  HiOutlineDocumentText,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineCloudArrowUp,
  HiOutlineCpuChip,
} from "react-icons/hi2";

import { useGetDocumentsQuery, useDeleteDocumentMutation } from "../ingestApi";
import { openUploadModal, selectDocument } from "../ingestSlice";
import { useToast } from "../../../components/Toast";
import Button from "../../../components/Button";
import EmptyState from "../../../components/EmptyState";
import { Skeleton } from "../../../components/Loader";

export default function Sidebar() {
  const dispatch = useDispatch();
  const toast = useToast();
  const selectedDocId = useSelector((s) => s.ingest.selectedDocId);

  const { data, isLoading, error } = useGetDocumentsQuery();
  const [deleteDocument, { isLoading: isDeleting }] = useDeleteDocumentMutation();

  // Track which doc is being deleted (for per-item spinner)
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (docId, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeletingId(docId);
    try {
      await deleteDocument(docId).unwrap();
      toast.success(`"${title}" deleted`);
    } catch {
      toast.error("Failed to delete document");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <aside className="w-72 h-full flex flex-col glass border-r border-surface-500/50">
      {/* Header */}
      <div className="p-4 border-b border-surface-500/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <HiOutlineCpuChip className="w-5 h-5 text-brand-500" />
            <h1 className="text-sm font-semibold text-gray-100">Second Brain</h1>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          icon={HiOutlinePlus}
          onClick={() => dispatch(openUploadModal())}
        >
          Upload Document
        </Button>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="p-3 space-y-4">
            <Skeleton lines={2} />
            <Skeleton lines={2} />
            <Skeleton lines={2} />
          </div>
        )}

        {error && (
          <div className="p-3 text-xs text-accent-red">
            Failed to load documents
          </div>
        )}

        {data && data.documents.length === 0 && (
          <EmptyState
            icon={HiOutlineCloudArrowUp}
            title="No documents yet"
            description="Upload a PDF, paste text, or add a URL to get started"
          />
        )}

        {data?.documents.map((doc) => (
          <DocumentItem
            key={doc.id}
            doc={doc}
            isSelected={doc.id === selectedDocId}
            isDeleting={doc.id === deletingId}
            onSelect={() => dispatch(selectDocument(doc.id))}
            onDelete={() => handleDelete(doc.id, doc.title)}
          />
        ))}
      </div>

      {/* Footer */}
      {data && (
        <div className="p-3 border-t border-surface-500/50">
          <p className="text-[11px] text-gray-500 text-center">
            {data.total} document{data.total !== 1 ? "s" : ""} in your brain
          </p>
        </div>
      )}
    </aside>
  );
}

/**
 * Single document item in the sidebar list.
 * Shows title, source type badge, status indicator, and delete button.
 */
function DocumentItem({ doc, isSelected, isDeleting, onSelect, onDelete }) {
  const statusIcon = doc.failed
    ? "✗"
    : doc.indexed
    ? "✓"
    : "⏳";

  const statusColor = doc.failed
    ? "text-accent-red"
    : doc.indexed
    ? "text-accent-green"
    : "text-accent-amber";

  const statusLabel = doc.failed
    ? "Failed"
    : doc.indexed
    ? "Indexed"
    : "Processing";

  return (
    <div
      onClick={onSelect}
      className={`
        group relative flex items-start gap-3 p-3 rounded-xl cursor-pointer
        transition-all duration-200
        ${isSelected
          ? "bg-brand-500/10 border border-brand-500/20"
          : "hover:bg-white/[0.03] border border-transparent"
        }
      `}
    >
      {/* Icon */}
      <div className="w-8 h-8 rounded-lg bg-surface-700 flex items-center justify-center shrink-0 mt-0.5">
        <HiOutlineDocumentText className="w-4 h-4 text-gray-400" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-200 truncate pr-6">
          {doc.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {/* Source type badge */}
          <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded bg-surface-700 text-gray-400">
            {doc.source_type}
          </span>
          {/* Status */}
          <span className={`text-[10px] font-medium ${statusColor}`}>
            {statusIcon} {statusLabel}
          </span>
        </div>
        {typeof doc.created_at === 'string' && doc.created_at && (
          <p className="text-[10px] text-gray-600 mt-1">{doc.created_at.split('T')[0]}</p>
        )}
      </div>

      {/* Delete button — appears on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={isDeleting}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1 rounded-md
          text-gray-500 hover:text-accent-red hover:bg-accent-red/10
          transition-all duration-200 disabled:opacity-50"
        title="Delete document"
      >
        <HiOutlineTrash className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

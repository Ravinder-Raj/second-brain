import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  HiOutlineDocumentText,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineSparkles,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
} from 'react-icons/hi2';

import Sidebar from './components/Sidebar';
import UploadModal from './components/UploadModal';
import { openUploadModal, selectDocument } from './ingestSlice';
import { useGetDocumentsQuery, useDeleteDocumentMutation } from './ingestApi';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { Skeleton } from '../../components/Loader';
import { useToast } from '../../components/Toast';

export default function IngestPage() {
  const dispatch = useDispatch();
  const toast = useToast();
  const selectedDocId = useSelector((s) => s.ingest.selectedDocId);

  const { data, isLoading } = useGetDocumentsQuery();
  const [deleteDocument] = useDeleteDocumentMutation();

  const selectedDoc = data?.documents?.find((d) => d.id === selectedDocId);

  const handleDelete = async (docId, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deleteDocument(docId).unwrap();
      toast.success(`"${title}" deleted`);
      if (selectedDocId === docId) {
        dispatch(selectDocument(null));
      }
    } catch {
      toast.error('Failed to delete document');
    }
  };

  return (
    <div className="flex h-[calc(100vh-65px)] overflow-hidden bg-surface-950">
      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main Document Workspace */}
      <main className="flex-1 flex flex-col overflow-hidden bg-surface-900/50">
        {/* Workspace Top Bar */}
        <header className="h-16 px-6 flex items-center justify-between border-b border-surface-500/50 glass">
          <div>
            <h1 className="text-base font-semibold text-gray-100">Knowledge Library</h1>
            <p className="text-xs text-gray-400">
              Ingest, view, and manage your source documents & personal notes
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={HiOutlinePlus}
            onClick={() => dispatch(openUploadModal())}
          >
            Add Knowledge
          </Button>
        </header>

        {/* Workspace Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Skeleton lines={4} />
              <Skeleton lines={4} />
              <Skeleton lines={4} />
            </div>
          ) : data?.documents?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  isSelected={doc.id === selectedDocId}
                  onSelect={() => dispatch(selectDocument(doc.id))}
                  onDelete={() => handleDelete(doc.id, doc.title)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={HiOutlineSparkles}
              title="Your Second Brain is Empty"
              description="Upload PDF research papers, saved web articles, or plain text notes to build your GraphRAG knowledge base."
            />
          )}

          {/* Selected Document Details Drawer / View */}
          {selectedDoc && (
            <div className="mt-6 p-6 rounded-2xl glass border border-brand-500/20 space-y-4 animate-fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-brand-500/20 text-brand-400">
                    {selectedDoc.source_type}
                  </span>
                  <h2 className="text-lg font-semibold text-gray-100 mt-1">
                    {selectedDoc.title}
                  </h2>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                    <HiOutlineClock className="w-3.5 h-3.5" /> Added: {selectedDoc.created_at || 'Just now'}
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  icon={HiOutlineTrash}
                  onClick={() => handleDelete(selectedDoc.id, selectedDoc.title)}
                >
                  Delete Document
                </Button>
              </div>

              <div className="p-4 rounded-xl bg-surface-950/60 border border-surface-500/40 text-xs font-mono text-gray-300">
                <p><strong className="text-gray-400">ID:</strong> {selectedDoc.id}</p>
                <p><strong className="text-gray-400">Status:</strong> {selectedDoc.indexed ? 'Indexed ✓' : selectedDoc.failed ? 'Failed ✗' : 'Processing ⏳'}</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Global Upload Modal */}
      <UploadModal />
    </div>
  );
}

function DocumentCard({ doc, isSelected, onSelect, onDelete }) {
  return (
    <div
      onClick={onSelect}
      className={`
        p-5 rounded-2xl cursor-pointer transition-all duration-200 glass border
        ${isSelected
          ? 'border-brand-500/50 bg-brand-500/10 shadow-lg shadow-brand-500/5'
          : 'border-surface-500/40 hover:border-brand-500/30 hover:bg-surface-800/80'
        }
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-700/80 flex items-center justify-center text-brand-400 shrink-0">
          <HiOutlineDocumentText className="w-5 h-5" />
        </div>
        <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-surface-700 text-gray-400">
          {doc.source_type}
        </span>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-gray-100 truncate">{doc.title}</h3>
        <div className="flex items-center gap-2 mt-2">
          {doc.indexed ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-green">
              <HiOutlineCheckCircle className="w-3.5 h-3.5" /> Indexed
            </span>
          ) : doc.failed ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-red">
              <HiOutlineExclamationCircle className="w-3.5 h-3.5" /> Failed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-amber">
              <HiOutlineClock className="w-3.5 h-3.5 animate-spin-slow" /> Processing
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-surface-500/30 flex items-center justify-between text-xs text-gray-500">
        <span>Click to inspect</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="hover:text-accent-red transition-colors p-1 rounded"
          title="Delete"
        >
          <HiOutlineTrash className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

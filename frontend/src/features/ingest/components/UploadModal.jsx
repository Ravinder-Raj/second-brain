/**
 * UploadModal — drag-and-drop file upload, URL input, or text paste.
 *
 * Three input modes, switched via tabs:
 *   1. File upload (PDF/TXT, max 10MB)
 *   2. URL (fetches and indexes a web page)
 *   3. Plain text (paste notes directly)
 *
 * After upload, polls /api/ingest/status/{job_id} to show progress.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useDropzone } from "react-dropzone";
import {
  HiOutlineDocumentArrowUp,
  HiOutlineGlobeAlt,
  HiOutlinePencilSquare,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
} from "react-icons/hi2";

import Modal from "../../../components/Modal";
import Button from "../../../components/Button";
import { Spinner } from "../../../components/Loader";
import { useToast } from "../../../components/Toast";
import { useUploadDocumentMutation, useGetJobStatusQuery } from "../ingestApi";
import {
  closeUploadModal,
  setActiveJob,
  updateJobStatus,
  clearActiveJob,
} from "../ingestSlice";

const TABS = [
  { key: "file", label: "File", icon: HiOutlineDocumentArrowUp },
  { key: "url", label: "URL", icon: HiOutlineGlobeAlt },
  { key: "text", label: "Text", icon: HiOutlinePencilSquare },
];

export default function UploadModal() {
  const dispatch = useDispatch();
  const toast = useToast();
  const { isUploadModalOpen, activeJobId, activeJobStatus } = useSelector(
    (s) => s.ingest
  );

  const [activeTab, setActiveTab] = useState("file");
  const [selectedFile, setSelectedFile] = useState(null);
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [titleInput, setTitleInput] = useState("");

  const [uploadDocument, { isLoading: isUploading }] =
    useUploadDocumentMutation();

  // Poll job status every 3s when we have an active job
  const { data: jobData } = useGetJobStatusQuery(activeJobId, {
    skip: !activeJobId,
    pollingInterval: 3000,
  });

  // Update job status from poll results
  useEffect(() => {
    if (jobData?.status) {
      dispatch(updateJobStatus(jobData.status));
      if (jobData.status === "done") {
        toast.success("Document indexed successfully!");
      } else if (jobData.status === "failed") {
        toast.error(jobData.error || "Indexing failed");
      }
    }
  }, [jobData, dispatch, toast]);

  // Dropzone config for file upload
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "text/plain": [".txt"],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
  });

  const handleSubmit = async () => {
    const formData = new FormData();

    if (activeTab === "file" && selectedFile) {
      formData.append("file", selectedFile);
    } else if (activeTab === "url" && urlInput.trim()) {
      formData.append("url", urlInput.trim());
    } else if (activeTab === "text" && textInput.trim()) {
      formData.append("plain_text", textInput.trim());
    } else {
      toast.error("Please provide input");
      return;
    }

    if (titleInput.trim()) {
      formData.append("title", titleInput.trim());
    }

    try {
      const result = await uploadDocument(formData).unwrap();
      dispatch(setActiveJob({ jobId: result.job_id, status: "processing" }));
      toast.info(`"${result.title}" accepted — indexing in progress`);
    } catch (err) {
      toast.error(err?.data?.detail || "Upload failed");
    }
  };

  const handleClose = () => {
    dispatch(closeUploadModal());
    dispatch(clearActiveJob());
    setSelectedFile(null);
    setUrlInput("");
    setTextInput("");
    setTitleInput("");
    setActiveTab("file");
  };

  const canSubmit =
    !isUploading &&
    !activeJobId &&
    ((activeTab === "file" && selectedFile) ||
      (activeTab === "url" && urlInput.trim()) ||
      (activeTab === "text" && textInput.trim()));

  return (
    <Modal isOpen={isUploadModalOpen} onClose={handleClose} title="Add Knowledge" maxWidth="max-w-md">
      {/* Show polling status if we have an active job */}
      {activeJobId ? (
        <JobStatus status={activeJobStatus} onClose={handleClose} />
      ) : (
        <>
          {/* Tab switcher */}
          <div className="flex gap-1 p-1 rounded-xl bg-surface-900 mb-5">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg
                  text-xs font-medium transition-all duration-200
                  ${activeTab === tab.key
                    ? "bg-surface-700 text-brand-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-300"
                  }
                `}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="space-y-4">
            {activeTab === "file" && (
              <div
                {...getRootProps()}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                  transition-all duration-200
                  ${isDragActive
                    ? "border-brand-500 bg-brand-500/5"
                    : selectedFile
                    ? "border-accent-green/30 bg-accent-green/5"
                    : "border-surface-500 hover:border-brand-500/50"
                  }
                `}
              >
                <input {...getInputProps()} />
                {selectedFile ? (
                  <div className="space-y-1">
                    <HiOutlineCheckCircle className="w-8 h-8 text-accent-green mx-auto" />
                    <p className="text-sm font-medium text-gray-200">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <HiOutlineDocumentArrowUp className="w-8 h-8 text-gray-500 mx-auto" />
                    <p className="text-sm text-gray-400">
                      Drop a PDF or TXT file here
                    </p>
                    <p className="text-xs text-gray-600">or click to browse (max 10MB)</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "url" && (
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/article"
                className="w-full px-4 py-3 rounded-xl bg-surface-900 border border-surface-500
                  text-sm text-gray-200 placeholder-gray-600
                  focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30
                  transition-all duration-200"
              />
            )}

            {activeTab === "text" && (
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste your notes, ideas, or any text..."
                rows={5}
                className="w-full px-4 py-3 rounded-xl bg-surface-900 border border-surface-500
                  text-sm text-gray-200 placeholder-gray-600 resize-none
                  focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30
                  transition-all duration-200"
              />
            )}

            {/* Optional title */}
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Title (optional)"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-900 border border-surface-500
                text-sm text-gray-200 placeholder-gray-600
                focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30
                transition-all duration-200"
            />

            {/* Submit */}
            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={handleSubmit}
              loading={isUploading}
              disabled={!canSubmit}
            >
              Upload & Index
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/**
 * Job status display — shown after upload while polling for indexing status.
 */
function JobStatus({ status, onClose }) {
  const isProcessing = status === "processing";
  const isDone = status === "done";
  const isFailed = status === "failed";

  return (
    <div className="text-center py-6 space-y-4">
      {isProcessing && (
        <>
          <Spinner size="lg" className="mx-auto" />
          <p className="text-sm text-gray-300">Indexing your document...</p>
          <p className="text-xs text-gray-500">
            GraphRAG is analyzing entities and relationships
          </p>
        </>
      )}
      {isDone && (
        <>
          <HiOutlineCheckCircle className="w-12 h-12 text-accent-green mx-auto" />
          <p className="text-sm font-medium text-gray-200">
            Document indexed successfully!
          </p>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      )}
      {isFailed && (
        <>
          <HiOutlineExclamationTriangle className="w-12 h-12 text-accent-red mx-auto" />
          <p className="text-sm font-medium text-gray-200">Indexing failed</p>
          <p className="text-xs text-gray-500">
            The document was saved but could not be indexed
          </p>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      )}
    </div>
  );
}

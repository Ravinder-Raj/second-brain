/**
 * Toast notification system.
 *
 * Uses React context so any component can fire a toast via useToast().
 * Toasts auto-dismiss after 4 seconds, stack vertically, and slide in
 * from the bottom-right corner.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success("Document uploaded!");
 *   toast.error("Upload failed");
 *   toast.info("Processing...");
 */
import { createContext, useContext, useState, useCallback } from "react";
import {
  HiCheckCircle,
  HiExclamationCircle,
  HiInformationCircle,
  HiXMark,
} from "react-icons/hi2";

const ToastContext = createContext(null);

const ICONS = {
  success: HiCheckCircle,
  error:   HiExclamationCircle,
  info:    HiInformationCircle,
};

const COLORS = {
  success: "text-accent-green border-accent-green/20 bg-accent-green/5",
  error:   "text-accent-red border-accent-red/20 bg-accent-red/5",
  info:    "text-brand-400 border-brand-500/20 bg-brand-500/5",
};

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, message) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (msg) => addToast("success", msg),
    error:   (msg) => addToast("error", msg),
    info:    (msg) => addToast("info", msg),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {/* Toast container — fixed bottom-right */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const IconComp = ICONS[t.type];
          return (
            <div
              key={t.id}
              className={`
                pointer-events-auto
                flex items-center gap-3 px-4 py-3 rounded-xl border
                glass shadow-xl
                animate-slide-up
                min-w-[280px] max-w-sm
                ${COLORS[t.type]}
              `}
            >
              <IconComp className="w-5 h-5 shrink-0" />
              <p className="text-sm text-gray-200 flex-1">{t.message}</p>
              <button
                onClick={() => removeToast(t.id)}
                className="text-gray-500 hover:text-gray-300 shrink-0"
              >
                <HiXMark className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

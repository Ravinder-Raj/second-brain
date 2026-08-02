import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  activeJobId: null,
  activeJobStatus: null, // "processing" | "done" | "failed"
  isUploadModalOpen: false,
  selectedDocId: null,
  uploadError: null,
};

const ingestSlice = createSlice({
  name: 'ingest',
  initialState,
  reducers: {
    openUploadModal: (state) => {
      state.isUploadModalOpen = true;
    },
    closeUploadModal: (state) => {
      state.isUploadModalOpen = false;
    },
    setActiveJob: (state, action) => {
      const { jobId, status } = action.payload;
      state.activeJobId = jobId;
      state.activeJobStatus = status || 'processing';
      state.uploadError = null;
    },
    setActiveJobId: (state, action) => {
      state.activeJobId = action.payload;
      state.activeJobStatus = 'processing';
      state.uploadError = null;
    },
    updateJobStatus: (state, action) => {
      state.activeJobStatus = action.payload;
      if (action.payload === 'done' || action.payload === 'failed') {
        // Keep activeJobId for modal UI display until dismissed
      }
    },
    clearActiveJob: (state) => {
      state.activeJobId = null;
      state.activeJobStatus = null;
    },
    setUploadError: (state, action) => {
      state.uploadError = action.payload;
    },
    clearIngestStatus: (state) => {
      state.activeJobId = null;
      state.activeJobStatus = null;
      state.uploadError = null;
    },
    selectDocument: (state, action) => {
      state.selectedDocId = action.payload;
    },
  },
});

export const {
  openUploadModal,
  closeUploadModal,
  setActiveJob,
  setActiveJobId,
  updateJobStatus,
  clearActiveJob,
  setUploadError,
  clearIngestStatus,
  selectDocument,
} = ingestSlice.actions;

export default ingestSlice.reducer;

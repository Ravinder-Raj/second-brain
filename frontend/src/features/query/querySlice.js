import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  currentMode: 'discover', // "discover" | "connect" | "challenge"
  inputText: '',
  activeConversationId: null,
  messages: [], // [{ id, question, answer, mode, timestamp }]
  isStreaming: false,
  activeQuestion: null,
  streamingAnswer: '',
  streamingError: null,
};

const querySlice = createSlice({
  name: 'query',
  initialState,
  reducers: {
    setMode: (state, action) => {
      state.currentMode = action.payload;
    },
    setInputText: (state, action) => {
      state.inputText = action.payload;
    },
    setActiveConversation: (state, action) => {
      state.activeConversationId = action.payload;
    },
    startNewConversation: (state) => {
      state.activeConversationId = null;
      state.inputText = '';
      state.messages = [];
      state.isStreaming = false;
      state.activeQuestion = null;
      state.streamingAnswer = '';
      state.streamingError = null;
    },
    addMessage: (state, action) => {
      state.messages.push(action.payload);
    },
    clearMessages: (state) => {
      state.messages = [];
      state.isStreaming = false;
      state.activeQuestion = null;
      state.streamingAnswer = '';
      state.streamingError = null;
    },
    startStreaming: (state, action) => {
      state.isStreaming = true;
      state.activeQuestion = action.payload;
      state.streamingAnswer = '';
      state.streamingError = null;
    },
    appendStreamingChunk: (state, action) => {
      state.streamingAnswer += action.payload;
    },
    setStreamingError: (state, action) => {
      state.streamingError = action.payload;
    },
    finishStreaming: (state) => {
      if (state.activeQuestion && (state.streamingAnswer || state.streamingError)) {
        state.messages.push({
          id: Date.now().toString(),
          question: state.activeQuestion,
          answer: state.streamingAnswer || state.streamingError,
          mode: state.currentMode,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      state.isStreaming = false;
      state.activeQuestion = null;
      state.streamingAnswer = '';
      state.streamingError = null;
    },
  },
});

export const {
  setMode,
  setInputText,
  setActiveConversation,
  startNewConversation,
  addMessage,
  clearMessages,
  startStreaming,
  appendStreamingChunk,
  setStreamingError,
  finishStreaming,
} = querySlice.actions;

export default querySlice.reducer;


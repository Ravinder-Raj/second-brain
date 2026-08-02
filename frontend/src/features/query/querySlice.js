import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  currentMode: 'discover', // "discover" | "connect" | "challenge"
  inputText: '',
  activeConversationId: null,
  messages: [], // [{ id, role, content, mode, timestamp }]
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
    },
    addMessage: (state, action) => {
      state.messages.push(action.payload);
    },
    clearMessages: (state) => {
      state.messages = [];
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
} = querySlice.actions;

export default querySlice.reducer;

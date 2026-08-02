import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  selectedNodeId: null,
  selectedNodeData: null,
  searchQuery: '',
};

const graphSlice = createSlice({
  name: 'graph',
  initialState,
  reducers: {
    selectNode: (state, action) => {
      if (typeof action.payload === 'object' && action.payload !== null) {
        state.selectedNodeId = action.payload.id;
        state.selectedNodeData = action.payload;
      } else {
        state.selectedNodeId = action.payload;
        state.selectedNodeData = null;
      }
    },
    clearSelection: (state) => {
      state.selectedNodeId = null;
      state.selectedNodeData = null;
    },
    setSearchQuery: (state, action) => {
      state.searchQuery = action.payload;
    },
  },
});

export const { selectNode, clearSelection, setSearchQuery } = graphSlice.actions;
export default graphSlice.reducer;
